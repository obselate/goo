## Fixed

- Let the window loop sleep while initial image uploads and prior presentation fences are pending. Queue completion wakes the window without polling on the UI thread.
