/**
 * lib/finance
 * ===========
 *
 * Every financial rule the product makes a claim about lives in this folder,
 * in a pure function that takes rows and returns numbers. No component
 * divides, no page decides a threshold, no route recomputes a formula its own
 * way. That is what makes the numbers on two different screens agree, and
 * what makes them testable -- see src/lib/__tests__/finance.test.ts.
 *
 * The older `lib/calculations.ts` remains the primitive layer (div, roundMoney,
 * period summaries, per-load metrics). This folder builds the product's
 * answers on top of it.
 *
 * The questions, and where each is answered:
 *
 *   How much did I make?               calculations.summarizePeriod
 *   What does a mile actually cost?    cost-per-mile.calculateTrueCostPerMile
 *   How much can I safely take out?    owner-pay.calculateSafeOwnerPay
 *   Was this load worth it?            load-score.calculateLoadScore
 *   Is this load worth taking?         load-calculator.calculateLoadEstimate
 *   What rate should I ask?            load-calculator.calculateTargetRate
 *   Where am I losing money?           deadhead + cost-per-mile lines
 *   Which brokers pay?                 brokers.calculateBrokerPerformance
 *   Which lanes pay?                   lanes.calculateLanePerformance
 *   Which TRUCK pays?                  fleet.calculateFleetSummary
 *   Am I on track this month?          goals.calculateProjection
 *   Am I saving enough?                reserves + maintenance-health
 *   What changed?                      insights.buildCockpitInsights
 */

export * from "./cost-per-mile";
export * from "./fleet";
export * from "./owner-pay";
export * from "./settlement";
export * from "./load-score";
export * from "./load-calculator";
export * from "./deadhead";
export * from "./brokers";
export * from "./lanes";
export * from "./goals";
export * from "./reserves";
export * from "./maintenance-health";
export * from "./insights";
