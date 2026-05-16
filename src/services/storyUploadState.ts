type Listener = (uploading: boolean) => void;

let _uploading = false;
const _listeners = new Set<Listener>();

export const storyUploadState = {
  get uploading() { return _uploading; },

  setUploading(v: boolean) {
    _uploading = v;
    _listeners.forEach(fn => fn(v));
  },

  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },
};
