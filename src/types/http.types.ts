import type { RequestHandler } from 'express';

/**
 * Path parameters as flat strings.
 *
 * Express 5 types req.params as `string | string[]` (ParamsDictionary), because a route
 * pattern can capture the same name more than once — `/:id+` yields an array. Every route
 * in this API uses a single `/:id`-style capture, so the value is always a plain string.
 * Declaring that here removes a `string | string[]` narrowing at every controller call
 * site; if a repeating pattern is ever added, that route must not use `Handler`.
 */
export type PathParams = Record<string, string>;

/**
 * The handler type every controller method is declared as.
 *
 * Controllers annotate their whole export with a Record of these rather than casting each
 * method, which is what gives req/res/next their types and keeps a mistyped key in the
 * route file a compile error.
 */
export type Handler = RequestHandler<PathParams>;
