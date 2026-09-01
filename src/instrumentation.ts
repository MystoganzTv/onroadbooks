/**
 * Every unhandled server error, caught in one place.
 *
 * Next calls this for page renders, route handlers and server actions alike,
 * which is the whole surface of the app. Until now a customer-facing failure
 * surfaced only when the customer complained.
 *
 * The route PATTERN is reported, never the concrete URL: `/loads/[id]` says
 * what broke without putting a customer's record id into a chat channel.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
): Promise<void> {
  const { reportRequestError } = await import("@/lib/operations");
  await reportRequestError(error, {
    route: context.routePath || request.path.split("?")[0],
    method: request.method,
    routerKind: context.routerKind,
    routeType: context.routeType,
  });
}
