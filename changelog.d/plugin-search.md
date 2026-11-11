## Changed

- AI plugin search ranks task and symbol matches and returns bounded query-matched excerpts. Reads return the selected section or API member with a byte cap and continuation.
- AI plugin search and reads include Widgets and Animations APIs from the project's restored packages, or the newest cached packages when no project is selected. Package reads include declaration types and XML documentation.
- AI plugin context and starter responses use one bundle hash instead of a full bundled-file hash map. Starter files keep their source and generated hashes.
- AI plugin checkout mode lists the same documents as the bundled reference.

## Fixed

- AI plugin search prefers matching API member names to sibling references and guide prose.
- AI plugin search matches common word forms, prefers exact words and nearby terms, and excludes inherited type summaries from member matches.
