package Goo

import System

/// Selects a native material behind the window's rendered content.
public enum WindowBackdrop {
  /// No native background effect.
  None;
  /// Requests compositor blur of the desktop behind this window.
  Blur;
}

/// Configures native desktop materials independently of widget shader effects.
public partial class Window {
  private var backdrop WindowBackdrop
  private var backdropFallbackColor Color = Color.Black

  /// Gets or sets the native desktop material. Blur requests per-pixel transparency at Open.
  /// Enable transparency before opening a window that will toggle blur at runtime.
  /// Native policy controls the appearance. Unsupported hosts use BackdropFallbackColor.
  public prop Backdrop WindowBackdrop {
    get -> backdrop
    set(value) {
      requireUiThread("Window.Backdrop")
      if value != WindowBackdrop.None && value != WindowBackdrop.Blur {
        throw ArgumentOutOfRangeException("value")
      }
      if backdrop == value { return }
      if let native = host as SdlHost? {
        if value == WindowBackdrop.Blur && !native.Transparent {
          throw InvalidOperationException("Enable transparency before opening a window that will use backdrop blur")
        }
        native.SetBackdrop(value == WindowBackdrop.Blur)
      }
      backdrop = value
      requestRender()
    }
  }

  /// Reports whether the open native host accepts blur and currently advertises support.
  /// The compositor can still vary or suppress its material according to system policy.
  public prop BackdropAvailable bool {
    get -> backdrop == WindowBackdrop.Blur && (host as SdlHost?)?.BackdropAvailable == true
  }

  /// Gets or sets the opaque window background used when requested blur is unavailable.
  /// Defaults to black. Foreground content is rendered over this color normally.
  public prop BackdropFallbackColor Color {
    get -> backdropFallbackColor
    set(value) {
      requireUiThread("Window.BackdropFallbackColor")
      if value.A != 1.0F { throw ArgumentException("Backdrop fallback must be opaque", "value") }
      if backdropFallbackColor == value { return }
      backdropFallbackColor = value
      requestRender()
    }
  }

  private prop RenderBackground Color {
    get -> backdrop == WindowBackdrop.Blur && !BackdropAvailable ? backdropFallbackColor : Background
  }
}
