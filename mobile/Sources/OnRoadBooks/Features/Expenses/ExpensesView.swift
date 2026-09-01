import SwiftUI

struct ExpensesView: View {
    let repository: LedgerRepository
    @State private var expenses: [ExpenseEntry] = []
    @State private var categories: [ExpenseCategory] = []
    @State private var isLoading = true
    @State private var isAdding = false

    private var total: Double { expenses.reduce(0) { $0 + $1.amount } }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                OBScreenHeader(
                    title: "Expenses",
                    actionIcon: "plus",
                    actionLabel: "Nuevo gasto",
                    action: { isAdding = true }
                )

                if isLoading {
                    ProgressView().tint(OBColor.primary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List {
                        Section {
                            HStack {
                                LabelXS("This Month")
                                Spacer()
                                MoneyText(amount: total, font: .title3.weight(.semibold))
                            }
                            .listRowBackground(OBColor.background)
                            .listRowSeparator(.hidden)
                        }
                        Section {
                            ForEach(expenses) { expense in
                                ExpenseRow(expense: expense)
                                    .listRowBackground(OBColor.card)
                                    .listRowSeparatorTint(OBColor.border)
                            }
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .background(OBColor.background)
            .toolbar(.hidden, for: .navigationBar)
            .task { await reload() }
            .refreshable { await reload() }
            .sheet(isPresented: $isAdding) {
                AddExpenseView(
                    repository: repository,
                    categories: categories,
                    onSaved: { Task { await reload() } }
                )
            }
        }
    }

    private func reload() async {
        let ledger = try? await repository.fetchExpenses()
        expenses = (ledger?.entries ?? []).sorted(by: { $0.date > $1.date })
        // Keep the last known picker list rather than emptying it on a failed
        // refresh -- a dropped connection should not make the add form unusable.
        if let categories = ledger?.categories, !categories.isEmpty { self.categories = categories }
        isLoading = false
    }
}

private struct ExpenseRow: View {
    let expense: ExpenseEntry
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(expense.category)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(OBColor.foreground)
                Text(expense.note)
                    .font(.caption)
                    .foregroundStyle(OBColor.mutedForeground)
                    .lineLimit(1)
            }
            Spacer()
            Text(expense.amount, format: .currency(code: "USD").precision(.fractionLength(2)))
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(OBColor.foreground)
        }
        .padding(.vertical, 4)
    }
}
