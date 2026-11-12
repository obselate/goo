## Changed

- Breaking: Rebuild on a mounted Cell now throws when called off its window's UI thread. Use Window.Post to apply background results and call Rebuild on the UI thread.
