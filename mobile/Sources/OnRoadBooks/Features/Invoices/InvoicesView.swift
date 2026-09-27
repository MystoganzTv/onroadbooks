import SwiftUI

/// Optional freight documents, matching the web's current income model.
struct InvoicesView: View {
    let repository: LedgerRepository
    var body: some View {
        ManagementView(repository: repository, resource: "invoices", title: "Facturas")
    }
}
