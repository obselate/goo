package Goo.Printing

import Goo

/// Reports export completion or native submission. Submission does not mean physical printing finished.
public enum PrintStatus {
    /// The complete PDF was written to the supplied stream.
    Exported,
    /// The native print service accepted the document.
    Submitted,
    /// The user or caller cancelled the operation.
    Cancelled,
    /// The platform print service or requested rendering is unavailable.
    Unsupported,
    /// The owner or renderer is serving another operation.
    Busy,
    /// The owner or renderer is not ready.
    NotReady,
    /// A page exceeds the memory limit.
    BudgetExceeded,
    /// The rendering device was lost.
    DeviceLost,
    /// Rendering, export or submission failed.
    Failed
}

/// A print Status with an optional native JobId and bounded Error detail.
public data class PrintResult(Status PrintStatus, JobId string = "", Error string = "") { }

/// Reports document pagination independently of export or spooler results.
public enum PrintLayoutStatus {
    /// The document can create the stated pages.
    Ready,
    /// The app cancelled pagination.
    Cancelled,
    /// The app could not paginate the document.
    Failed
}

/// Physical WidthPoints and HeightPoints, margins LeftPoints, TopPoints, RightPoints and BottomPoints,
/// and raster resolution DpiX and DpiY in dots per inch.
public data struct PrintPageSettings(WidthPoints float64, HeightPoints float64,
    LeftPoints float64, TopPoints float64, RightPoints float64, BottomPoints float64,
    DpiX int32 = 300, DpiY int32 = 300) { }

/// Pagination Status, PageCount and optional Error detail for the chosen paper settings.
public data struct PrintLayoutResult(Status PrintLayoutStatus, PageCount int32, Error string = "") { }

/// Supplies fresh page cells from a fixed document snapshot on the Goo owner thread.
public interface IPrintDocument {
    /// Recomputes page breaks for paper settings. Page count must be positive on Ready.
    func Paginate(settings PrintPageSettings) PrintLayoutResult;

    /// Creates a full-paper page, including its margins. Index is zero-based and pages can be requested again.
    func CreatePage(index int32, settings PrintPageSettings) Cell;
}
