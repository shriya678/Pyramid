/**
 * Fallback for the @modal parallel slot when no route matches. Returning
 * null keeps the DOM clean — the modal simply isn't there unless an
 * intercepted route (like @modal/(.)t/[id]) matches.
 */
export default function ModalSlotDefault() {
  return null;
}
