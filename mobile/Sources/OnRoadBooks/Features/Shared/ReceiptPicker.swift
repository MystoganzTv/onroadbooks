import PhotosUI
import SwiftUI
import UIKit

/// Getting a receipt into the app: the camera at the pump, or the photo roll
/// for one that was already snapped.
///
/// The camera uses `UIImagePickerController` because that is still the only way
/// to open it directly; the library uses `PHPickerViewController`, which needs
/// no photo-library permission at all — the person picks, and the app receives
/// only that one image.
struct ReceiptPicker: UIViewControllerRepresentable {
    enum Source: Identifiable {
        case camera, library
        var id: Int { self == .camera ? 0 : 1 }
    }

    let source: Source
    let onPicked: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIViewController(context: Context) -> UIViewController {
        switch source {
        case .camera:
            let picker = UIImagePickerController()
            picker.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
            picker.delegate = context.coordinator
            return picker
        case .library:
            var configuration = PHPickerConfiguration()
            configuration.filter = .images
            configuration.selectionLimit = 1
            let picker = PHPickerViewController(configuration: configuration)
            picker.delegate = context.coordinator
            return picker
        }
    }

    func updateUIViewController(_ controller: UIViewController, context: Context) {}

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate,
                             PHPickerViewControllerDelegate {
        private let parent: ReceiptPicker
        init(_ parent: ReceiptPicker) { self.parent = parent }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            if let image = info[.originalImage] as? UIImage { parent.onPicked(image) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }

        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            guard let provider = results.first?.itemProvider,
                  provider.canLoadObject(ofClass: UIImage.self) else {
                parent.dismiss()
                return
            }
            provider.loadObject(ofClass: UIImage.self) { [parent] object, _ in
                guard let image = object as? UIImage else {
                    Task { @MainActor in parent.dismiss() }
                    return
                }
                Task { @MainActor in
                    parent.onPicked(image)
                    parent.dismiss()
                }
            }
        }
    }
}

extension UIImage {
    /// A receipt, small enough to send from one bar of signal.
    ///
    /// A modern phone photo is 3–5 MB and the upload route refuses anything
    /// over 4 MB, but that is not the real reason to shrink it: a receipt is
    /// read, not admired, and 1600px on the long edge keeps every digit legible
    /// at a tenth of the bytes. Quality steps down if a busy photo still comes
    /// out too big rather than failing at the pump.
    func receiptJPEG(maxEdge: CGFloat = 1600, limitBytes: Int = 3_200_000) -> Data? {
        let longest = max(size.width, size.height)
        let scale = longest > maxEdge ? maxEdge / longest : 1
        let target = CGSize(width: size.width * scale, height: size.height * scale)

        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: target))
        }

        for quality in [0.7, 0.55, 0.4, 0.25] {
            if let data = resized.jpegData(compressionQuality: quality), data.count <= limitBytes {
                return data
            }
        }
        return resized.jpegData(compressionQuality: 0.2)
    }
}
