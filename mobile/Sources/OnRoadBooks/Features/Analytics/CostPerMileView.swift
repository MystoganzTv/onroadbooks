import SwiftUI

struct CostPerMileSnapshot: Decodable {
    struct Line: Decodable, Identifiable {
        var id: String { category }
        let category: String
        let label: String
        let behavior: String
        let amount: Double
        let perMile: Double
        let share: Double
    }
    struct Basis: Decodable {
        let totalMiles: Double
        let fixedTotal: Double
        let variableTotal: Double
        let totalCost: Double
        let actualCostPerMile: Double
        let debtServicePerMile: Double
        let cashCostPerMile: Double
        let sufficient: Bool
        let basisLabel: String
        let lines: [Line]
    }
    let periodLabel: String
    let actual: Basis
    let trailing: Basis?
}
struct CostPerMileView: View {
    let repository: LedgerRepository
    @State private var snapshot: CostPerMileSnapshot?
    @State private var failure: String?
    var body: some View {
        List {
            if let snapshot {
                Section(snapshot.periodLabel) {
                    metric("Costo operativo / mi", snapshot.actual.actualCostPerMile, available: snapshot.actual.sufficient)
                    metric("Deuda / mi", snapshot.actual.debtServicePerMile, available: snapshot.actual.sufficient)
                    metric("Costo de caja / mi", snapshot.actual.cashCostPerMile, available: snapshot.actual.sufficient)
                    LabeledContent("Millas", value: snapshot.actual.totalMiles.formatted())
                    Text("Los gastos se cuentan en su fecha real, sin prorratear. Las millas incluyen las vacías.").font(.caption).foregroundStyle(.secondary)
                }
                if let trailing = snapshot.trailing {
                    Section("Referencia para planificar") {
                        metric("Costo operativo / mi", trailing.actualCostPerMile, available: trailing.sufficient)
                        Text(trailing.basisLabel).font(.caption).foregroundStyle(.secondary)
                    }
                }
                Section("Categorías") {
                    ForEach(snapshot.actual.lines) { line in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(line.label)
                                Spacer()
                                Text(line.amount, format: .currency(code: "USD")).monospacedDigit()
                            }
                            HStack {
                                Text(line.behavior == "FIXED" ? "Fijo" : line.behavior == "VARIABLE" ? "Variable" : "Mixto")
                                Spacer()
                                if snapshot.actual.sufficient { Text("\(line.perMile, format: .currency(code: "USD"))/mi") }
                            }.font(.caption).foregroundStyle(.secondary)
                            ProgressView(value: min(100, max(0, line.share)), total: 100).tint(OBColor.primary)
                        }.padding(.vertical, 4)
                    }
                }
            } else if failure == nil { ProgressView("Cargando costos…") }
            if let failure {
                Text(failure).foregroundStyle(OBColor.neg)
                Button("Reintentar") { Task { await reload() } }
            }
        }
        .navigationTitle("Costo por milla")
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden)
        .background(OBColor.background)
        .obScopeBar()
        .obReloadsOnScope { await reload() }
        .obRefreshable { await reload() }
    }
    private func metric(_ label: String, _ amount: Double, available: Bool) -> some View {
        HStack {
            Text(label)
            Spacer()
            if available { Text(amount, format: .currency(code: "USD")).monospacedDigit() }
            else { Text("Sin millas").foregroundStyle(.secondary) }
        }
    }
    @MainActor private func reload() async {
        do { snapshot = try await repository.fetchCostPerMile(); failure = nil }
        catch { failure = error.localizedDescription }
    }
}
