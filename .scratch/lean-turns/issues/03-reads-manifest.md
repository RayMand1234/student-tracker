# 03: Reads manifest and missing-read refusal

**Spec:** `../spec.md` (Implementation Decisions: Reads manifest; Testing Decisions: reads-manifest test). **Findings:** `01-out-dir-version-probe.md`

**Blocked by:** 02

**Status:** ready-for-agent

**What to build:**
- For an operation and its arguments, the CLI prints the `ArtifactData` reads it needs (get/list/query with filters and limits), in a form the model sends in one message.
- If a snapshot is missing a document the operation needs, planning refuses and names the missing reads, instead of treating the document as absent.
- Tell "read and absent" (a `get` that found nothing, recorded in the snapshot) apart from "never read".

- [ ] A manifest command for `record-entry`, in a shape later operations plug into
- [ ] The snapshot records which reads were made, so a missing document can be told apart from one never fetched
- [ ] Test: a snapshot holding exactly the manifest's reads plans successfully, and removing any one read refuses and names it
- [ ] Output stays short: paths, versions and results only, no document contents
