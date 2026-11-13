### Breaking changes

- Blob and Style declaration properties now have guarded setters. Build declarations and add children before returning them to Goo. Assignments and child-list changes after hand-off throw `InvalidOperationException`. State styles and accessibility declarations freeze with their Blob. Goo copies shared child lists at hand-off.
- Return a new Blob when its declaration changes. Returning the same Blob does not refresh it. Virtual items no longer write keys into authored content. `Each` rejects a previously handed-off Blob that has no key. Set its key before hand-off or return a new Blob.
