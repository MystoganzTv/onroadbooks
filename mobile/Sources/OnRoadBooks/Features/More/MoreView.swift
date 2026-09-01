import SwiftUI

/// Everything from the web app's `NAV_GROUPS` (`src/components/shell/nav-items.ts`)
/// that isn't already a tab. Each row is a real destination, just not a
/// built-out screen yet — `ComingSoonView` keeps the map of the whole app
/// honest on mobile instead of hiding sections that exist on web.
private struct MoreItem: Identifiable {
    let id = UUID()
    let title: String
    let icon: String
    let fleetOnly: Bool
}

private struct MoreGroup: Identifiable {
    let id = UUID()
    let title: String
    let items: [MoreItem]
}

private let moreGroups: [MoreGroup] = [
    MoreGroup(title: "Operate", items: [
        MoreItem(title: "Load Calculator", icon: "sum", fleetOnly: false), // "calculator" isn't a real SF Symbol -- caught live on Enrique's simulator
        MoreItem(title: "Fuel", icon: "fuelpump.fill", fleetOnly: false),
        MoreItem(title: "Drivers", icon: "person.crop.circle", fleetOnly: true),
    ]),
    MoreGroup(title: "Money", items: [
        MoreItem(title: "Invoices", icon: "doc.text.fill", fleetOnly: false),
        MoreItem(title: "Driver Pay", icon: "list.clipboard.fill", fleetOnly: true),
        MoreItem(title: "Reserves", icon: "building.columns.fill", fleetOnly: false),
    ]),
    MoreGroup(title: "Intelligence", items: [
        MoreItem(title: "IFTA", icon: "mappin.and.ellipse", fleetOnly: false),
        MoreItem(title: "Analytics", icon: "chart.bar.fill", fleetOnly: false),
        MoreItem(title: "Reports", icon: "chart.bar.doc.horizontal.fill", fleetOnly: false),
        MoreItem(title: "Fleet", icon: "truck.box.fill", fleetOnly: true),
        MoreItem(title: "Team", icon: "person.3.fill", fleetOnly: true),
        MoreItem(title: "Truck", icon: "steeringwheel", fleetOnly: false),
    ]),
]

struct MoreView: View {
    let repository: LedgerRepository
    let accountLabel: String
    var onSignOut: (() -> Void)?

    @ViewBuilder
    private func destination(for item: MoreItem) -> some View {
        switch item.title {
        case "Load Calculator":
            LoadCalculatorView()
        case "Fuel":
            FuelView(repository: repository)
        case "Invoices":
            InvoicesView(repository: repository)
        default:
            ComingSoonView(title: item.title, systemImage: item.icon)
        }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                OBScreenHeader(title: "More")

                List {
                    ForEach(moreGroups) { group in
                        Section {
                            ForEach(group.items) { item in
                                NavigationLink {
                                    destination(for: item)
                                } label: {
                                    Label {
                                        HStack {
                                            Text(item.title).foregroundStyle(OBColor.foreground)
                                            if item.fleetOnly {
                                                Text("FLEET")
                                                    .font(.system(size: 9, weight: .bold))
                                                    .foregroundStyle(OBColor.warn)
                                                    .padding(.horizontal, 6).padding(.vertical, 2)
                                                    .background(OBColor.warnSoft, in: Capsule())
                                            }
                                        }
                                    } icon: {
                                        Image(systemName: item.icon).foregroundStyle(OBColor.primary)
                                    }
                                }
                                .listRowBackground(OBColor.card)
                                .listRowSeparatorTint(OBColor.border)
                            }
                        } header: {
                            Text(group.title)
                                .foregroundStyle(OBColor.mutedForeground)
                        }
                    }

                    Section {
                        NavigationLink {
                            ComingSoonView(title: "Plans & Billing", systemImage: "creditcard.fill")
                        } label: {
                            Label("Plans & Billing", systemImage: "creditcard.fill")
                                .foregroundStyle(OBColor.foreground)
                        }
                        .listRowBackground(OBColor.card)
                        .listRowSeparatorTint(OBColor.border)

                        NavigationLink {
                            SettingsView(accountLabel: accountLabel, onSignOut: onSignOut)
                        } label: {
                            Label("Settings", systemImage: "gearshape.fill")
                                .foregroundStyle(OBColor.foreground)
                        }
                        .listRowBackground(OBColor.card)
                        .listRowSeparatorTint(OBColor.border)
                    }
                }
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
            }
            .background(OBColor.background)
            .toolbar(.hidden, for: .navigationBar)
        }
    }
}
