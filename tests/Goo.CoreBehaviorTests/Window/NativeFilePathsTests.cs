using System.Collections.Generic;
using System.IO;
using Goo;
using Xunit;

public sealed class NativeFilePathsTests
{
    [Fact]
    public void ExactPathAndAggregateLimitsSucceedAndRejectedAddsPreserveTheCollection()
    {
        var prefix = Path.GetPathRoot(Path.GetTempPath())!;
        var path = prefix + new string('x', NativeFilePaths.MaxPathUnits - prefix.Length);
        var paths = new List<string>();
        var units = 0;
        for (var i = 0; i < NativeFilePaths.MaxTotalUnits / path.Length; i++)
            NativeFilePaths.Add(paths, path, ref units);
        Assert.Equal(NativeFilePaths.MaxTotalUnits, units);
        var count = paths.Count;
        var error = Assert.Throws<NativePathLimitException>(() => NativeFilePaths.Add(paths, prefix, ref units));
        Assert.DoesNotContain("Clipboard", error.Message);
        Assert.Equal(count, paths.Count);
        Assert.Equal(NativeFilePaths.MaxTotalUnits, units);
        paths.Clear();
        units = 0;
        Assert.Throws<NativePathLimitException>(() => NativeFilePaths.Add(paths, path + "x", ref units));
        Assert.Empty(paths);
        Assert.Equal(0, units);
    }

    [Fact]
    public void ExactCountLimitSucceedsAndInvalidPathsHaveTransportNeutralErrors()
    {
        var paths = new List<string>();
        var units = 0;
        var path = Path.GetTempPath();
        for (var i = 0; i < NativeFilePaths.MaxCount; i++)
            NativeFilePaths.Add(paths, path, ref units);
        Assert.Throws<NativePathLimitException>(() => NativeFilePaths.Add(paths, path, ref units));
        Assert.Equal(NativeFilePaths.MaxCount, paths.Count);
        Assert.Equal(path.Length * paths.Count, units);
        foreach (var invalid in new[] { "relative", path + "\0name" })
        {
            var error = Assert.Throws<InvalidDataException>(() => NativeFilePaths.Add(paths, invalid, ref units));
            Assert.DoesNotContain("Clipboard", error.Message);
        }
    }
}
