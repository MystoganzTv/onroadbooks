import SwiftUI

/// What the phone is still holding.
///
/// Two kinds, and the difference is the whole point of this screen. The ones
/// waiting for signal need nothing from you and say so. The ones marked for
/// your attention were either refused by the ledger, or sent into a connection
/// that died — and that second case is the only honest place to put a decision
/// the app cannot make: it may already be saved, and only you can go look.
struct PendingWritesView: View {
    @ObservedObject var queue: WriteQueue
    @ObservedObject var monitor: NetworkMonitor

    var body: some View {
        Group {
            if queue.items.isEmpty {
                empty
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: OBSpacing.lg) {
                        if !queue.needsAttention.isEmpty {
                            section(
                                "Necesitan que decidas",
                                queue.needsAttention,
                                footer: nil
                            )
                        }
                        if !queue.waiting.isEmpty {
                            section(
                                "Esperando señal",
                                queue.waiting,
                                footer: monitor.isOnline
                                    ? "Enviándose ahora."
                                    : "Se envían solas en cuanto vuelva la señal. Puedes cerrar la app."
                            )
                        }
                        Spacer(minLength: OBSpacing.xl)
                    }
                    .padding(.top, OBSpacing.sm)
                }
            }
        }
        .background(OBColor.background)
        .navigationTitle("Pendientes")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                if queue.isSending {
                    ProgressView().tint(OBColor.primary)
                } else if !queue.waiting.isEmpty && monitor.isOnline {
                    Button("Enviar") { Task { await queue.flush() } }
                }
            }
        }
    }

    private var empty: some View {
        VStack(spacing: OBSpacing.sm) {
            Image(systemName: "checkmark.circle")
                .font(.system(size: 34))
                .foregroundStyle(OBColor.mutedForeground)
            Text("Nada pendiente")
                .font(.headline)
                .foregroundStyle(OBColor.foreground)
            Text("Todo lo que has guardado está en el ledger.")
                .font(.subheadline)
                .foregroundStyle(OBColor.mutedForeground)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    private func section(_ title: String, _ writes: [QueuedWrite], footer: String?) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            PanelHeader(title: title, trailing: "\(writes.count)")
            VStack(spacing: 0) {
                ForEach(Array(writes.enumerated()), id: \.element.id) { index, write in
                    row(write)
                        .padding(OBSpacing.md)
                    if index < writes.count - 1 {
                        Rectangle().fill(OBColor.border).frame(height: 1)
                            .padding(.leading, OBSpacing.md)
                    }
                }
            }
            if let footer {
                Text(footer)
                    .font(.caption)
                    .foregroundStyle(OBColor.mutedForeground)
                    .padding(.horizontal, OBSpacing.md)
                    .padding(.bottom, OBSpacing.md)
            }
        }
        .obPanel()
        .padding(.horizontal, OBSpacing.md)
    }

    @ViewBuilder
    private func row(_ write: QueuedWrite) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(write.summary)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(OBColor.foreground)
                Spacer(minLength: OBSpacing.sm)
                if let amount = write.amount {
                    Text(amount, format: .currency(code: "USD").precision(.fractionLength(2)))
                        .font(.subheadline.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(OBColor.foreground)
                }
            }

            Text(write.queuedAt, format: .dateTime.day().month().hour().minute())
                .font(.caption2)
                .foregroundStyle(OBColor.mutedForeground)

            if let note = write.note {
                Text(note)
                    .font(.caption)
                    .foregroundStyle(write.state == .attention ? OBColor.warn : OBColor.mutedForeground)
            }

            if write.state == .attention {
                HStack(spacing: OBSpacing.sm) {
                    Button("Reintentar") { Task { await queue.retry(write) } }
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(OBColor.primary)
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(OBColor.surfaceRaised, in: Capsule())
                        .buttonStyle(.plain)
                        .disabled(queue.isSending)

                    Button("Descartar") { queue.discard(write) }
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(OBColor.neg)
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(OBColor.surfaceRaised, in: Capsule())
                        .buttonStyle(.plain)
                }
            }
        }
    }
}

/// The strip above the tab bar content. Present only when there is something to
/// say, so an empty queue costs no screen.
struct PendingBanner: View {
    @ObservedObject var queue: WriteQueue
    @ObservedObject var monitor: NetworkMonitor
    let onTap: () -> Void

    var body: some View {
        if !queue.items.isEmpty {
            Button(action: onTap) {
                HStack(spacing: OBSpacing.sm) {
                    Image(systemName: icon)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(tint)
                    Text(message)
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(OBColor.foreground)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(OBColor.mutedForeground)
                }
                .padding(.horizontal, OBSpacing.md)
                .padding(.vertical, OBSpacing.sm)
                .background(OBColor.surfaceRaised)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(OBColor.border).frame(height: 1)
                }
            }
            .buttonStyle(.plain)
        }
    }

    private var icon: String {
        if !queue.needsAttention.isEmpty { return "exclamationmark.triangle.fill" }
        return monitor.isOnline ? "arrow.up.circle" : "wifi.slash"
    }

    private var tint: Color {
        queue.needsAttention.isEmpty ? OBColor.primary : OBColor.warn
    }

    private var message: String {
        let attention = queue.needsAttention.count
        if attention > 0 {
            return attention == 1
                ? "1 registro necesita que decidas"
                : "\(attention) registros necesitan que decidas"
        }
        let waiting = queue.waiting.count
        if !monitor.isOnline {
            return waiting == 1 ? "1 registro guardado, sin señal" : "\(waiting) registros guardados, sin señal"
        }
        return waiting == 1 ? "Enviando 1 registro…" : "Enviando \(waiting) registros…"
    }
}
