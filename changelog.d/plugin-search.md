## Changed

- AI plugin search ranks task and symbol matches and returns short section summaries. Reads return the selected section or API member with a byte cap and continuation.
- AI plugin search and reads include Widgets and Animations APIs from the project's restored packages, or the newest cached packages when no project is selected. Package reads include declaration types and XML documentation.
- AI plugin context and starter responses use one bundle hash instead of a full bundled-file hash map. Starter files keep their source and generated hashes.
- AI plugin checkout mode lists the same documents as the bundled reference.
