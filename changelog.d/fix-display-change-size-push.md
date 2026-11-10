## Fixed

- A window no longer resizes back to its previous size when its display or display scale changes while a native size change is still pending. Placement.Restore right after Window.Open on a 150% or 200% display kept the default size instead of the restored one.
