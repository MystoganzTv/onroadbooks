import SwiftUI

/// The single period control, used on every screen — the phone's `PeriodControls`.
///
/// Mirrors the web bar element for element: month back / month picker / month
/// forward, then the period chips in the web's own order and grouping, then
/// the custom range. The web bar scrolls horizontally when it runs out of room
/// (`overflow-x-auto`), which is exactly what a phone needs, so this one does
/// too rather than inventing a phone-only arrangement.
struct OBPeriodBar: View {
    @EnvironmentObject private var scopeStore: ScopeStore
    @State private var showingCustom = false
    @State private var customFrom = ""
    @State private var customTo = ""

    private var scope: Scope { scopeStore.scope }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                monthStepper
                divider
                ForEach(Array(PeriodKey.barOptions.enumerated()), id: \.element) { index, key in
                    if index > 0, PeriodKey.barOptions[index - 1].group != key.group {
                        divider
                    }
                    chip(key.shortLabel, isOn: scope.key == key) { scopeStore.select(key) }
                }
                divider
                chip(customLabel, isOn: scope.key == .custom) {
                    customFrom = scope.from ?? OBDate.todayISO()
                    customTo = scope.to ?? OBDate.todayISO()
                    showingCustom = true
                }
                if !scopeStore.trucks.isEmpty {
                    divider
                    truckSwitcher
                }
            }
            .padding(.horizontal, OBSpacing.md)
            .padding(.vertical, OBSpacing.sm)
        }
        .background(OBColor.background)
        .overlay(alignment: .bottom) {
            Rectangle().fill(OBColor.border).frame(height: 1)
        }
        .sheet(isPresented: $showingCustom) { customRangeSheet }
    }

    private var customLabel: String {
        guard scope.key == .custom, let from = scope.from, let to = scope.to else { return "Rango" }
        return "\(from.suffix(5)) – \(to.suffix(5))"
    }

    private var divider: some View {
        Rectangle().fill(OBColor.border).frame(width: 1, height: 18)
    }

    private var monthStepper: some View {
        HStack(spacing: 0) {
            Button { scopeStore.stepMonth(-1) } label: {
                Image(systemName: "chevron.left").font(.caption.weight(.semibold))
            }
            .accessibilityLabel(Text("Mes anterior"))

            Menu {
                ForEach(OBDate.monthOptions(around: scope.month), id: \.value) { option in
                    Button(option.label) { scopeStore.selectMonth(option.value) }
                }
            } label: {
                Text(OBDate.monthLabel(scope.month))
                    .font(.caption.weight(.medium))
                    .lineLimit(1)
                    .padding(.horizontal, 8)
            }

            Button { scopeStore.stepMonth(1) } label: {
                Image(systemName: "chevron.right").font(.caption.weight(.semibold))
            }
            .accessibilityLabel(Text("Mes siguiente"))
        }
        .foregroundStyle(OBColor.foreground)
        .padding(.horizontal, 6)
        .padding(.vertical, 6)
        .background(OBColor.surfaceSunken, in: Capsule())
    }

    private var truckSwitcher: some View {
        Menu {
            Button("Toda la flota") { scopeStore.selectTruck(nil) }
            ForEach(scopeStore.trucks) { truck in
                Button(truck.name) { scopeStore.selectTruck(truck.id) }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "truck.box.fill").font(.caption2)
                Text(scopeStore.trucks.first { $0.id == scope.truckId }?.name ?? "Toda la flota")
                    .lineLimit(1)
            }
            .font(.caption.weight(.medium))
            .foregroundStyle(scope.truckId == nil ? OBColor.mutedForeground : OBColor.foreground)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(OBColor.surfaceSunken, in: Capsule())
        }
    }

    private func chip(_ label: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.caption.weight(.medium))
                .lineLimit(1)
                .foregroundStyle(isOn ? OBColor.foreground : OBColor.mutedForeground)
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(isOn ? OBColor.surfaceRaised : Color.clear, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? [.isSelected] : [])
    }

    private var customRangeSheet: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker("Desde", selection: dateBinding($customFrom), displayedComponents: .date)
                    DatePicker("Hasta", selection: dateBinding($customTo), displayedComponents: .date)
                } footer: {
                    Text("Cualquier rango de fechas, igual que en la web.")
                        .foregroundStyle(OBColor.mutedForeground)
                }
                .listRowBackground(OBColor.card)
            }
            .formStyle(.grouped)
            .scrollContentBackground(.hidden)
            .background(OBColor.background)
            .foregroundStyle(OBColor.foreground)
            .tint(OBColor.primary)
            .navigationTitle("Rango")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { showingCustom = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Aplicar") {
                        scopeStore.selectCustom(from: customFrom, to: customTo)
                        showingCustom = false
                    }
                    .disabled(customFrom.isEmpty || customTo.isEmpty || customFrom > customTo)
                }
            }
        }
    }

    /// The scope speaks "YYYY-MM-DD" because that is what the server parses;
    /// DatePicker speaks `Date`. This is the only place the two meet.
    private func dateBinding(_ text: Binding<String>) -> Binding<Date> {
        Binding(
            get: { ISODate.parse(text.wrappedValue) },
            set: { text.wrappedValue = ISODate.day($0) }
        )
    }
}

extension View {
    /// Reload when the period bar changes — and once when the screen appears,
    /// which is what a plain `.task` did before there was a bar.
    ///
    /// `alsoOn` folds a screen-local control into the same task id rather than
    /// adding a second `.task`, which would fetch twice on every appearance.
    func obReloadsOnScope(
        alsoOn token: AnyHashable? = nil,
        _ reload: @escaping () async -> Void
    ) -> some View {
        modifier(ReloadsOnScope(token: token, reload: reload))
    }

    /// The bar pinned under the navigation bar, for pushed screens. Tab roots
    /// place it themselves, directly below their own header — the same order
    /// the web uses: page header, then the period controls.
    func obScopeBar() -> some View {
        safeAreaInset(edge: .top, spacing: 0) { OBPeriodBar() }
    }
}

private struct ReloadsOnScope: ViewModifier {
    @EnvironmentObject private var scopeStore: ScopeStore
    let token: AnyHashable?
    let reload: () async -> Void

    private struct Key: Hashable {
        let scope: Scope
        let token: AnyHashable?
    }

    func body(content: Content) -> some View {
        content.task(id: Key(scope: scopeStore.scope, token: token)) { await reload() }
    }
}
