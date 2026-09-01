import Foundation

/// Ported from the web app's `src/lib/finance/load-calculator.ts` — same
/// cost model, same comment explaining WHY (kept verbatim below), so the
/// two never quietly drift apart.
///
///   Total miles      = loaded + deadhead to pickup      (always both)
///   Fuel             = total miles / MPG x price per gallon
///   Tolls            = entered
///   Dispatch         = percent of gross, or a flat amount
///   Factoring        = percent of gross, or a flat amount
///   Other            = entered
///   Overhead         = total miles x overhead cost per mile
///
/// `overheadPerMile` is meant to be the truck's own historical cost per
/// mile with fuel, tolls, dispatch and factoring already removed — those
/// four are entered explicitly above, and charging them twice is the
/// classic way a load calculator lies to you.
enum FeeMode: String, CaseIterable, Identifiable {
    case percent = "%", amount = "$"
    var id: String { rawValue }
}

struct CostLine: Identifiable {
    let id = UUID()
    let label: String
    let amount: Double
    let note: String?
}

struct LoadEstimate {
    let totalMiles: Double
    let grossPerTotalMile: Double
    let deadheadPct: Double
    let fuelCost: Double
    let tolls: Double
    let dispatch: Double
    let factoring: Double
    let otherCost: Double
    let overhead: Double
    let tripCost: Double
    let totalCost: Double
    let profit: Double
    let profitPerMile: Double
    let profitMargin: Double
    let lines: [CostLine]
    let rating: LoadRating
    let valid: Bool
}

enum LoadCalculatorMath {
    private static func roundMoney(_ v: Double) -> Double { (v * 100).rounded() / 100 }
    private static func div(_ a: Double, _ b: Double) -> Double { b > 0 ? a / b : 0 }

    private static func feeAmount(mode: FeeMode, value: Double, gross: Double) -> Double {
        let safe = value.isFinite && value > 0 ? value : 0
        return mode == .percent ? roundMoney(gross * (safe / 100)) : roundMoney(safe)
    }

    /// Exactly `rateLoad` from the web app: the account's own saved bands, and
    /// nothing else.
    ///
    /// This used to carry a "deadhead above 40% drops the band" rule that the
    /// web app does not have — invented here, and it meant the same load could
    /// be GOOD on a laptop and MARGINAL on a phone. Deadhead is already inside
    /// profit per mile, because every cost is charged across total miles.
    private static func rate(profitPerMile: Double, thresholds: RatingThresholds) -> LoadRating {
        if profitPerMile >= thresholds.great { return .great }
        if profitPerMile >= thresholds.good { return .good }
        if profitPerMile >= thresholds.marginal { return .marginal }
        return .bad
    }

    static func evaluate(
        grossRate: Double,
        loadedMiles: Double,
        deadheadMiles: Double,
        fuelPrice: Double,
        mpg: Double,
        tolls: Double,
        dispatchMode: FeeMode,
        dispatchValue: Double,
        factoringMode: FeeMode,
        factoringValue: Double,
        otherCost: Double,
        overheadPerMile: Double,
        thresholds: RatingThresholds
    ) -> LoadEstimate {
        let loadedMiles = max(0, loadedMiles)
        let deadheadMiles = max(0, deadheadMiles)
        let totalMiles = loadedMiles + deadheadMiles
        let grossRate = max(0, grossRate)

        let gallons = mpg > 0 ? totalMiles / mpg : 0
        let fuelCost = roundMoney(gallons * max(0, fuelPrice))
        let tollsAmt = roundMoney(max(0, tolls))
        let dispatch = feeAmount(mode: dispatchMode, value: dispatchValue, gross: grossRate)
        let factoring = feeAmount(mode: factoringMode, value: factoringValue, gross: grossRate)
        let other = roundMoney(max(0, otherCost))
        let overhead = roundMoney(totalMiles * max(0, overheadPerMile))

        let tripCost = roundMoney(fuelCost + tollsAmt + dispatch + factoring + other)
        let totalCost = roundMoney(tripCost + overhead)
        let profit = roundMoney(grossRate - totalCost)
        let profitPerMile = div(profit, totalMiles)
        let profitMargin = grossRate > 0 ? div(profit, grossRate) * 100 : 0
        let deadheadPct = div(deadheadMiles, totalMiles)

        let lines: [CostLine] = [
            CostLine(label: "Fuel", amount: fuelCost,
                     note: mpg > 0 ? String(format: "%.1f gal at $%.2f/gal, %.1f MPG", gallons, fuelPrice, mpg) : "Enter MPG to estimate fuel"),
            CostLine(label: "Tolls", amount: tollsAmt, note: nil),
            CostLine(label: "Dispatch", amount: dispatch, note: dispatchMode == .percent ? "\(Int(dispatchValue))% of gross" : "Flat fee"),
            CostLine(label: "Factoring", amount: factoring, note: factoringMode == .percent ? "\(Int(factoringValue))% of gross" : "Flat fee"),
            CostLine(label: "Other costs", amount: other, note: nil),
            CostLine(label: "Truck operating cost", amount: overhead,
                     note: String(format: "%.0f mi at $%.2f/mi overhead", totalMiles, overheadPerMile)),
        ]

        return LoadEstimate(
            totalMiles: totalMiles,
            grossPerTotalMile: div(grossRate, totalMiles),
            deadheadPct: deadheadPct,
            fuelCost: fuelCost,
            tolls: tollsAmt,
            dispatch: dispatch,
            factoring: factoring,
            otherCost: other,
            overhead: overhead,
            tripCost: tripCost,
            totalCost: totalCost,
            profit: profit,
            profitPerMile: profitPerMile,
            profitMargin: profitMargin,
            lines: lines,
            rating: rate(profitPerMile: profitPerMile, thresholds: thresholds),
            valid: totalMiles > 0 && mpg > 0
        )
    }

    /// R = (C + P) / (1 - f) — solving for the rate that clears a target
    /// profit per mile, given fixed costs C and a combined dispatch+factoring
    /// fee rate f (see the header comment in the web source for the algebra).
    static func targetRate(
        loadedMiles: Double,
        deadheadMiles: Double,
        fuelPrice: Double,
        mpg: Double,
        tolls: Double,
        dispatchMode: FeeMode,
        dispatchValue: Double,
        factoringMode: FeeMode,
        factoringValue: Double,
        otherCost: Double,
        overheadPerMile: Double,
        targetProfitPerMile: Double
    ) -> (breakeven: Double, target: Double, totalMiles: Double, impossible: Bool) {
        let totalMiles = max(0, loadedMiles) + max(0, deadheadMiles)
        let gallons = mpg > 0 ? totalMiles / mpg : 0
        let fuelCost = roundMoney(gallons * max(0, fuelPrice))
        let tollsAmt = roundMoney(max(0, tolls))
        let other = roundMoney(max(0, otherCost))
        let overhead = roundMoney(totalMiles * max(0, overheadPerMile))

        let flatFees =
            (dispatchMode == .amount ? max(0, dispatchValue) : 0) +
            (factoringMode == .amount ? max(0, factoringValue) : 0)
        let feeRate =
            (dispatchMode == .percent ? max(0, dispatchValue) : 0) / 100 +
            (factoringMode == .percent ? max(0, factoringValue) : 0) / 100

        let fixedCost = roundMoney(fuelCost + tollsAmt + other + overhead + flatFees)
        let impossible = feeRate >= 1
        guard !impossible else { return (0, 0, totalMiles, true) }

        let breakeven = roundMoney(fixedCost / (1 - feeRate))
        let targetProfit = targetProfitPerMile * totalMiles
        let target = roundMoney((fixedCost + targetProfit) / (1 - feeRate))
        return (breakeven, target, totalMiles, false)
    }
}
