## Fixed

- Hiding a Wayland window no longer unmaps its surface during an in-flight present and blocks other windows from closing. Visibility, input and accessibility change immediately. Showing the window cancels a pending native unmap.
