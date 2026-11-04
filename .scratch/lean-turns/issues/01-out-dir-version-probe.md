# 01: How `out_dir` reads and file-based batches behave

**Spec:** `../spec.md` (Further Notes, first open question)

**Status:** resolved

Probe on a real, private, throwaway artifact with the db capability.

## Answer

- An `out_dir` read (`get`, `query`) saves `<out_dir>/<collection path>/<doc_id>.json`, holding **only the document's data**: no `version` and no id. The version appears **only in the tool's result listing**, one line per document: `- "e-1"  96 bytes  version 2  "<full file path>"`.
- So the plan step has to be handed the versions, as a short `<collection path>/<doc_id> <version>` list that the model copies from the read results. Only documents a write *changes* need a pin (card, Entry, `meta/alerts`, settings, the Commander's Playbook items). New records are creates without a pin.
- `out_dir` refuses Windows short (8.3) paths such as `C:\Users\RAYMAN~1\...` ("the file-edit safety rules protect that location"). The same folder spelled in full works. The CLI must print full, long paths for snapshot folders.
- `batch` entries take `file_path` (a JSON file whose top-level object is the document) in place of `data`. Creates (no `if_version`) and pinned updates mix in one batch. The commit is atomic: one stale pin returns `version_mismatch`, writes nothing, and the error names the first stale entry (its index and path).
- Per the tool description, a create of an existing document without `if_version` is refused. Not probed.
