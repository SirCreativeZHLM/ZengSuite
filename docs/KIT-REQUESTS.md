# Kit requests

## store (requested by `notes`) — additive, none blocking
`zeng.store` is a flat key -> one JSON file store. Notes works with it today (alternating A/B record slots, an index with three rotating copies, base64 attachment chunks of about 0.9 MB per key), but these small additions would make a 5,000-note library cleaner and safer:
- `zeng.store.remove(key)` (and `store_remove` IPC). Notes can only overwrite deleted notes/attachments with `null`, which leaves empty `.json` files behind.
- `zeng.store.keys(prefix)` so a lost index could be rebuilt from `n_*` files instead of relying on three index copies.
- `store_set` should write to a temp file and rename (the same way `write_file` does) so a crash can't truncate a record. Notes works around it by never overwriting the only copy of a record, but the shell is the right place for this.
- Binary values (`store_set_bytes` / `store_get_bytes`): attachments pay a 33% base64 tax plus a full JSON string round trip through IPC. Fine up to a few tens of MB; larger attachments are slow.

## From Stage (keynote)
- `zeng.onFiles` semantics are inverted versus the docs: `deliver()` stops at the first callback that returns anything other than `false`, so an `async` callback (always a Promise) swallows every file. Stage works around it with a synchronous callback (`false` = not handled). Worth fixing in `deliver` (treat `true`/Promise as handled) or documenting.
- `include_dir!` does not rebuild when only `ui/` files change; `touch src/main.rs` is needed. A `build.rs` with `cargo:rerun-if-changed=ui` in `zeng-shell`'s app template would fix it.
- A second window (presenter display) is not possible with the single-window shell; Stage ships it as an overlay mode.
