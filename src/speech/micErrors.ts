/** Plain-language help for getUserMedia failures, keyed by DOMException name. */
export const MIC_ERROR_HELP: Record<string, string> = {
  NotAllowedError:
    'Allow the microphone: tap Grabar again and choose “Allow”. If no prompt appears, open Settings → Safari → Microphone, set it to “Ask” or “Allow”, then reopen 100 Días.',
  NotFoundError: 'No microphone was found.',
  NotReadableError: 'The microphone is in use by another app (a call, Voice Memos…). Close it and try again.',
  AbortError: 'The microphone was interrupted. Try again.',
};
