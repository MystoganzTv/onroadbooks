import SwiftUI

/// Fill-ups, and the one number that says whether the truck is getting worse.
///
/// MPG comes from the server or not at all: it is derived per truck from
/// consecutive odometer readings and stays empty until one truck has two of
/// them. Showing a plausible-looking average of gallons over trip miles would
/// be easy and wrong, so this screen says what is missing instead.
struct FuelView: View {
    let repository: LedgerRepository

    @State private var ledger: FuelLedger?
    @State private var isLoading = true
    @State private var isAdding = false
    @State private var pendingDelete: FuelStop?
    @State private var deleteFailure: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView().tint(OBColor.primary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let ledger {
                content(ledger)
            } else {
                ComingSoonView(title: "Fuel", systemImage: "fuelpump.fill")
            }
        }
        .background(OBColor.background)
        // Deleting the fill-up takes its mirrored FUEL row out of the ledger
        // with it -- which is exactly why the ledger row itself refuses to be
        // deleted from the Expenses screen.
        .confirmationDialog(
            "¿Borrar esta carga de diésel?",
            isPresented: Binding(
                get: { pendingDelete != nil },
                set: { if !$0 { pendingDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Borrar", role: .destructive) {
                guard let stop = pendingDelete else { return }
                pendingDelete = nil
                Task {
                    do {
                        try await repository.deleteFuelStop(id: stop.id)
                        await reload()
                    } catch {
                        deleteFailure = (error as? LocalizedError)?.errorDescription
                            ?? "No se pudo borrar la carga."
                    }
                }
            }
            Button("Cancelar", role: .cancel) { pendingDelete = nil }
        } message: {
            Text("También sale del libro de gastos, porque esa fila la escribió esta carga.")
        }
        .alert(
            "No se borró",
            isPresented: Binding(
                get: { deleteFailure != nil },
                set: { if !$0 { deleteFailure = nil } }
            )
        ) {
            Button("Entendido", role: .cancel) { deleteFailure = nil }
        } message: {
            Text(deleteFailure ?? "")
        }
        .navigationTitle("Fuel")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { isAdding = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel(Text("Nueva carga de combustible"))
            }
        }
        .task { await reload() }
        .refreshable { await reload() }
        .sheet(isPresented: $isAdding) {
            AddFuelView(repository: repository, onSaved: { Task { await reload() } })
        }
    }

    @ViewBuilder
    private func content(_ ledger: FuelLedger) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OBSpacing.lg) {
                HStack(spacing: OBSpacing.sm) {
                    tile("MPG", mpgText(ledger.summary), footnote: mpgFootnote(ledger.summary))
                    tile(
                        "Costo / milla",
                        ledger.summary.fuelCostPerMile
                            .formatted(.currency(code: "USD").precision(.fractionLength(2))),
                        footnote: "solo combustible"
                    )
                }
                .padding(.horizontal, OBSpacing.md)

                HStack(spacing: OBSpacing.sm) {
                    tile(
                        "Galones",
                        ledger.summary.totalGallons.formatted(.number.precision(.fractionLength(1))),
                        footnote: "\(ledger.summary.entryCount) cargas"
                    )
                    tile(
                        "Precio promedio",
                        ledger.summary.averagePricePerGallon
                            .formatted(.currency(code: "USD").precision(.fractionLength(3))),
                        footnote: "por galón"
                    )
                }
                .padding(.horizontal, OBSpacing.md)

                VStack(alignment: .leading, spacing: 0) {
                    PanelHeader(
                        title: "Cargas",
                        trailing: ledger.summary.totalCost
                            .formatted(.currency(code: "USD").precision(.fractionLength(0)))
                    )
                    if ledger.entries.isEmpty {
                        Text("Ninguna carga registrada en este período.")
                            .font(.subheadline)
                            .foregroundStyle(OBColor.mutedForeground)
                            .padding(OBSpacing.md)
                    } else {
                        VStack(spacing: 0) {
                            ForEach(Array(ledger.entries.enumerated()), id: \.element.id) { index, stop in
                                FuelStopRow(stop: stop)
                                    .padding(.horizontal, OBSpacing.md)
                                    .padding(.vertical, OBSpacing.sm)
                                    .contentShape(Rectangle())
                                    .contextMenu {
                                        Button(role: .destructive) {
                                            pendingDelete = stop
                                        } label: {
                                            Label("Borrar carga", systemImage: "trash")
                                        }
                                    }
                                if index < ledger.entries.count - 1 {
                                    Rectangle().fill(OBColor.border).frame(height: 1)
                                        .padding(.leading, OBSpacing.md)
                                }
                            }
                        }
                    }
                }
                .obPanel()
                .padding(.horizontal, OBSpacing.md)
                .padding(.bottom, OBSpacing.xl)
            }
            .padding(.top, OBSpacing.sm)
        }
    }

    private func tile(_ label: String, _ value: String, footnote: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            LabelXS(label)
            Text(value)
                .font(.title2.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(OBColor.foreground)
            Text(footnote)
                .font(.caption)
                .foregroundStyle(OBColor.mutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(OBSpacing.md)
        .obPanel()
    }

    private func mpgText(_ summary: FuelSummary) -> String {
        summary.milesPerGallon.map { $0.formatted(.number.precision(.fractionLength(1))) } ?? "—"
    }

    private func mpgFootnote(_ summary: FuelSummary) -> String {
        guard let miles = summary.odometerMiles, summary.milesPerGallon != nil else {
            return "hacen falta dos odómetros"
        }
        return "\(Int(miles).formatted()) mi medidas"
    }

    private func reload() async {
        ledger = try? await repository.fetchFuel()
        isLoading = false
    }
}

private struct FuelStopRow: View {
    let stop: FuelStop

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 3) {
                Text(stop.location ?? "Carga de combustible")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(OBColor.foreground)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(OBColor.mutedForeground)
            }
            Spacer(minLength: OBSpacing.sm)
            Text(stop.totalCost, format: .currency(code: "USD").precision(.fractionLength(2)))
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(OBColor.foreground)
        }
    }

    private var detail: String {
        var parts = [
            "\(stop.gallons.formatted(.number.precision(.fractionLength(1)))) gal",
            stop.pricePerGallon.formatted(.currency(code: "USD").precision(.fractionLength(3))),
        ]
        if let odometer = stop.odometer { parts.append("\(odometer.formatted()) mi") }
        if let jurisdiction = stop.jurisdiction { parts.append(jurisdiction) }
        return parts.joined(separator: " · ")
    }
}
