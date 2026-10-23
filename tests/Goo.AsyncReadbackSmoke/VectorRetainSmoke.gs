package Goo

import Goo.Svg
import System
import System.Diagnostics
import System.Globalization
import System.Runtime.CompilerServices

internal class VectorRetainCell : Cell {
    internal let Asset VectorAsset
    internal let Count int32
    internal let Markers bool
    internal var Zoom float64 = 1.0

    internal init(asset VectorAsset, count int32, markers bool) {
        Asset = asset
        Count = count
        Markers = markers
    }

    override func Build() Blob {
        let content = Container{
            Width: 800, Height: 600, Position: PositionType.Absolute,
            TransformOriginX: 0, TransformOriginY: 0,
            Transform: PanelTransform{ScaleX: Markers ? 1.0 : Zoom, ScaleY: Markers ? 1.0 : Zoom},
        }
        for index in 0 ... Count {
            content.Children.Add(Container{
                Key: index.ToString(CultureInfo.InvariantCulture),
                Width: 12, Height: 12, Position: PositionType.Absolute,
                TransformOriginX: 0, TransformOriginY: 0,
                Transform: PanelTransform{
                    TranslateX: float64(index % 40) * 18.0 * (Markers ? Zoom : 1.0),
                    TranslateY: float64(index / 40) * 18.0 * (Markers ? Zoom : 1.0),
                },
                Asset.Render(),
            })
        }
        return Container{Width: Percent(100), Height: Percent(100), content}
    }
}

internal class VectorRetainSmoke {
    shared {
        internal func Run() {
            VerifyRegistry()
            VerifyRetirement()
            let asset = Svg.Parse("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'>"
                + "<path d='M1 10 L6 1 L11 10 Z' fill='#40c080' stroke='#ffffff' stroke-width='1'/></svg>")
            for count in []int32{1, 1000} {
                Measure(asset, count, false)
                Measure(asset, count, true)
            }
        }

        private func VerifyRegistry() {
            let paths = [3000]VectorPath
            let registry = VulkanPathIdentityRegistry()
            try {
                for index in 0 ... paths.Length {
                    paths[index] = PathBuilder(0.0, 0.0, 4000.0, 12.0)
                        .MoveTo(float64(index), 1.0).LineTo(float64(index), 10.0).Build()
                    registry.Resolve(paths[index])
                }
                let samples = [30]float64
                let sweepSamples = [samples.Length]float64
                for frame in 0 ... samples.Length {
                    let start = Stopwatch.GetTimestamp()
                    registry.SweepDeadRecords()
                    sweepSamples[frame] = Milliseconds(Stopwatch.GetTimestamp() - start)
                    for path in paths { registry.Resolve(path) }
                    samples[frame] = Milliseconds(Stopwatch.GetTimestamp() - start)
                }
                Array.Sort(samples)
                Array.Sort(sweepSamples)
                Console.WriteLine("VECTOR_REGISTRY live=3000 resolves=3000 p50_ms=" + Number(samples[15])
                    + " p95_ms=" + Number(samples[28]) + " sweep_p50_ms=" + Number(sweepSamples[15]))
                let first = registry.Resolve(paths[0])
                let equal = PathBuilder(0.0, 0.0, 4000.0, 12.0).MoveTo(0.0, 1.0).LineTo(0.0, 10.0).Build()
                if registry.Resolve(equal).PathId.LogicalId != first.PathId.LogicalId {
                    throw InvalidOperationException("Equal vector paths did not share an identity")
                }
                GC.KeepAlive(paths)
            } finally { registry.Dispose() }
        }

        private func VerifyRetirement() {
            let registry = VulkanPathIdentityRegistry()
            try {
                let identity = RetainEphemeral(registry)
                GC.Collect()
                GC.WaitForPendingFinalizers()
                registry.SweepDeadRecords()
                if registry.Count != 1 { throw InvalidOperationException("Resident vector identity was removed") }
                registry.Release(identity)
                GC.Collect()
                GC.WaitForPendingFinalizers()
                registry.SweepDeadRecords()
                if registry.Count != 0 { throw InvalidOperationException("Dead vector identity was retained") }
            } finally { registry.Dispose() }
        }

        @MethodImpl(MethodImplOptions.NoInlining)
        private func RetainEphemeral(registry VulkanPathIdentityRegistry) VulkanPathResourceIdentity {
            let path = PathBuilder(0.0, 0.0, 12.0, 12.0).MoveTo(1.0, 1.0).LineTo(10.0, 10.0).Build()
            let identity = registry.Resolve(path)
            registry.Retain(identity)
            return identity
        }

        private func Measure(asset VectorAsset, count int32, markers bool) {
            let root = VectorRetainCell(asset, count, markers)
            let window = Window{
                Title: "Goo retained vector zoom", Width: 800, Height: 600,
                VSync: false, Background: Color.Black, Root: root,
            }
            try {
                window.Open()
                for frame in 0 ... 10 { WindowReadbackTestFixture.ForceRender(window, 0.0) }
                let initial = WindowReadbackTestFixture.PathResources(window)
                let builds = PathBandEncoder.BuildCount
                let samples = [300]float64
                for frame in 0 ... samples.Length {
                    root.Zoom = 0.75 + float64(frame % 100) / 200.0
                    let start = Stopwatch.GetTimestamp()
                    root.Rebuild()
                    WindowReadbackTestFixture.ForceRender(window, 0.0)
                    samples[frame] = Milliseconds(Stopwatch.GetTimestamp() - start)
                    if PathBandEncoder.BuildCount != builds {
                        throw InvalidOperationException("Transform-only vector frame rebuilt encoded geometry")
                    }
                }
                let finalStats = WindowReadbackTestFixture.PathResources(window)
                if finalStats.PathCount != initial.PathCount || finalStats.WordCount != initial.WordCount
                    || finalStats.UploadSequence != initial.UploadSequence {
                    throw InvalidOperationException("Transform-only vector frame changed atlas geometry")
                }
                Array.Sort(samples)
                let metrics = WindowReadbackTestFixture.Metrics(window)
                Console.WriteLine("VECTOR_RETAIN instances=" + count.ToString(CultureInfo.InvariantCulture)
                    + " markers=" + markers.ToString() + " frames=300 encode_builds=0 paths="
                    + finalStats.PathCount.ToString(CultureInfo.InvariantCulture) + " atlas_bytes="
                    + (uint64(finalStats.WordCount) * 4uL).ToString(CultureInfo.InvariantCulture)
                    + " p50_ms=" + Number(samples[150]) + " p95_ms=" + Number(samples[284])
                    + " framebuffer=" + metrics.FramebufferWidth.ToString() + "x" + metrics.FramebufferHeight.ToString()
                    + " scale=" + Number(metrics.DisplayScaleX) + "x" + Number(metrics.DisplayScaleY))
            } finally { window.Close() }
        }

        private func Milliseconds(ticks int64) float64 -> float64(ticks) * 1000.0 / float64(Stopwatch.Frequency)

        private func Number(value float64) string -> value.ToString("F3", CultureInfo.InvariantCulture)
    }
}
