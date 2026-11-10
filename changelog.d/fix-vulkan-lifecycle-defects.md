## Fixed

- With more than one window, growing the shared path atlas no longer destroys the atlas that another window's queued frame still draws from. Growth now waits until that frame is submitted.
- A hidden layer-shell window now retires its submitted frame and finishes closing. `Window.Hide` on a layer-shell window no longer blocks on a frame that cannot be presented.
- Device recovery keeps a Wayland window that was created but not yet shown, and finishes its startup work before it clears Vulkan state.
- A window whose surface extent is zero no longer fails swapchain recreation or device recovery. It presents again when the extent becomes non-zero.
