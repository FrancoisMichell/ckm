/**
 * Re-exports the @Public() decorator from common/decorators so auth-module
 * consumers can import from a single, intuitive location.
 *
 * The canonical source is src/common/decorators.ts — this is a convenience
 * re-export only, not a second definition. Importing from either location is fine.
 */
export { Public, IS_PUBLIC_KEY } from '../../common/decorators';
