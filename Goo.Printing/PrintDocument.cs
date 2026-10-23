namespace Goo.Printing;

/// <summary>Reports export completion or native submission. Submission does not mean physical printing finished.</summary>
public enum PrintStatus
{
    /// <summary>The complete PDF was written to the supplied stream.</summary>
    Exported,
    /// <summary>The native print service accepted the document.</summary>
    Submitted,
    /// <summary>The user or caller cancelled the operation.</summary>
    Cancelled,
    /// <summary>The platform print service or requested rendering is unavailable.</summary>
    Unsupported,
    /// <summary>The owner or renderer is serving another operation.</summary>
    Busy,
    /// <summary>The owner or renderer is not ready.</summary>
    NotReady,
    /// <summary>A page exceeds the memory limit.</summary>
    BudgetExceeded,
    /// <summary>The rendering device was lost.</summary>
    DeviceLost,
    /// <summary>Rendering, export or submission failed.</summary>
    Failed
}

/// <summary>A print outcome with an optional native job id and bounded detail.</summary>
public sealed record PrintResult(PrintStatus Status, string JobId = "", string Error = "");

/// <summary>Reports document pagination independently of export or spooler results.</summary>
public enum PrintLayoutStatus
{
    /// <summary>The document can create the stated pages.</summary>
    Ready,
    /// <summary>The app cancelled pagination.</summary>
    Cancelled,
    /// <summary>The app could not paginate the document.</summary>
    Failed
}

/// <summary>Physical paper and margins in points, with the requested raster resolution in dots per inch.</summary>
public readonly record struct PrintPageSettings(double WidthPoints, double HeightPoints,
    double LeftPoints, double TopPoints, double RightPoints, double BottomPoints, int DpiX = 300, int DpiY = 300);

/// <summary>The page count after applying the chosen paper settings.</summary>
public readonly record struct PrintLayoutResult(PrintLayoutStatus Status, int PageCount, string Error = "");

/// <summary>Supplies fresh page cells from a fixed document snapshot on the Goo owner thread.</summary>
public interface IPrintDocument
{
    /// <summary>Recomputes page breaks for paper settings. Page count must be positive on Ready.</summary>
    PrintLayoutResult Paginate(PrintPageSettings settings);

    /// <summary>Creates a full-paper page, including its margins. Index is zero-based and pages can be requested again.</summary>
    Cell CreatePage(int index, PrintPageSettings settings);
}
