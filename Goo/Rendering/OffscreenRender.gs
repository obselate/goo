package Goo

import System

/// Reports an independent render operation without exposing GPU resource handles.
public enum OffscreenRenderStatus {
  Success; Busy; NotReady; Unsupported; BudgetExceeded; DeviceLost; Cancelled; Failed
}

/// Specifies Size in layout units, PixelWidth, PixelHeight, Background and the MaxBytes allocation limit.
public data struct OffscreenRenderOptions(Size LayoutSize,
  PixelWidth uint32, PixelHeight uint32, Background Color, MaxBytes int64) { }

/// Contains Status, owned Capture pixels on Success and Error detail on failure.
public data struct OffscreenRenderResult(Status OffscreenRenderStatus, Capture WindowCapture?, Error string) { }
