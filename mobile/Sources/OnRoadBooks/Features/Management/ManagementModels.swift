import Foundation

/// Presentation data only. Every control is rendered by SwiftUI and every
/// mutation is validated by the same server schema and repository as the web.
struct ManagementCollection: Decodable {
    let title: String
    let description: String
    let fields: [ManagementField]
    let records: [ManagementRecord]
    let defaults: [String: String]
    let canCreate: Bool
    let canEdit: Bool
    let canDelete: Bool
    let refusal: String?
    let scanAvailable: Bool
}
struct ManagementField: Decodable, Identifiable {
    var id: String { key }
    let key: String
    let label: String
    let kind: String
    let required: Bool
    let options: [ManagementOption]?
    let section: String
}
struct ManagementOption: Decodable, Identifiable {
    var id: String { value }
    let value: String
    let label: String
}
struct ManagementRecord: Decodable, Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let values: [String: String]
    let details: [ManagementDetail]
}
struct ManagementDetail: Decodable {
    let label: String
    let value: String
}
struct ManagementWrite: Encodable {
    let id: String?
    let values: [String: String]
    // Encode a new record's id explicitly as null, as required by the API.
    enum CodingKeys: String, CodingKey { case id, values }
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        if let id { try container.encode(id, forKey: .id) }
        else { try container.encodeNil(forKey: .id) }
        try container.encode(values, forKey: .values)
    }
}
extension Notification.Name {
    static let obLedgerChanged = Notification.Name("obLedgerChanged")
}
