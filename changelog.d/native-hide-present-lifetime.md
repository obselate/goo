## Fixed

- Hiding a Wayland window no longer blocks queued presentation or other windows from closing. Visibility, input and accessibility update immediately. Showing the window cancels a pending native hide.
