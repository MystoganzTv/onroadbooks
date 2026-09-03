import SwiftUI

/// What a driver was paid, and why.
///
/// Read-only on purpose. Building a statement is a desk job — it pulls a
/// period's loads together and applies pay terms — and a PAID one is a
/// permanent accounting record that the web refuses to alter. What a phone is
/// genuinely good for is answering "how much did I pay him, and for what",
/// usually with the driver standing right there.
struct DriverPayView: View {
    let repository: LedgerRepository

    @State private var statements: [DriverStatement] = []
    @State private var isLoading = true
    @State private var refusal: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView().tint(OBColor.primary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let refusal {
                VStack(spacing: OBSpacing.sm) {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 30))
                        .foregroundStyle(OBColor.mutedForeground)
                    Text(refusal)
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(OBColor.mutedForeground)
                        .padding(.horizontal, OBSpacing.lg)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if statements.isEmpty {
                VStack(spacing: OBSpacing.sm) {
                    Text("Sin liquidaciones de chofer")
                        .font(.headline)
                        .foregroundStyle(OBColor.foreground)
                    Text("Se arman en la web, con las cargas del período. Aquí las consultas.")
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(OBColor.mutedForeground)
                        .padding(.horizontal, OBSpacing.lg)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    ForEach(statements) { statement in
                        NavigationLink {
                            DriverStatementDetailView(
                                repository: repository,
                                statementId: statement.id
                            )
                        } label: {
                            StatementRow(statement: statement)
                        }
                        .listRowBackground(OBColor.card)
                        .listRowSeparatorTint(OBColor.border)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .background(OBColor.background)
        .navigationTitle("Pago a choferes")
        .navigationBarTitleDisplayMode(.inline)
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        do {
            statements = try await repository.fetchDriverStatements()
            refusal = nil
        } catch APIError.refused(let message) {
            refusal = message
        } catch {
            refusal = nil
        }
        isLoading = false
    }
}

private struct StatementRow: View {
    let statement: DriverStatement

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(statement.driverName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(OBColor.foreground)
                Spacer()
                StatusPill(text: statement.status, isActive: statement.status != "PAID")
            }
            Text("\(statement.periodStart) → \(statement.periodEnd)")
                .font(.caption)
                .foregroundStyle(OBColor.mutedForeground)

            HStack(spacing: OBSpacing.lg) {
                metric("Cargas", "\(statement.loads)")
                metric("Millas", "\(Int(statement.totalMiles))")
                metric("Pago base", statement.basePay.formatted(.currency(code: "USD").precision(.fractionLength(0))))
            }

            HStack {
                Text("Neto pagado")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(OBColor.mutedForeground)
                Spacer()
                MoneyText(amount: statement.netPay, font: .subheadline.weight(.bold))
            }

            if statement.deductions > 0 || statement.advances > 0 || statement.additions > 0 {
                Text(adjustmentSummary)
                    .font(.caption2)
                    .foregroundStyle(OBColor.mutedForeground)
            }
        }
        .padding(.vertical, 6)
    }

    /// The line that answers the only question a driver ever asks about a
    /// statement: why is this smaller than I expected.
    private var adjustmentSummary: String {
        var parts: [String] = []
        if statement.additions > 0 {
            parts.append("+\(statement.additions.formatted(.currency(code: "USD").precision(.fractionLength(0)))) extras")
        }
        if statement.deductions > 0 {
            parts.append("−\(statement.deductions.formatted(.currency(code: "USD").precision(.fractionLength(0)))) descuentos")
        }
        if statement.advances > 0 {
            parts.append("−\(statement.advances.formatted(.currency(code: "USD").precision(.fractionLength(0)))) adelantos")
        }
        return parts.joined(separator: " · ")
    }

    private func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(OBColor.mutedForeground)
            Text(value)
                .font(.caption.weight(.medium))
                .monospacedDigit()
                .foregroundStyle(OBColor.foreground)
        }
    }
}
