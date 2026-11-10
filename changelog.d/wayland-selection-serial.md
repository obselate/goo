## Fixed

- On Linux Wayland, clipboard and primary selection text set before the window's first key, button or touch event now reaches other applications. The bundled SDL 3.4.0 previously kept such a copy private to the process.
