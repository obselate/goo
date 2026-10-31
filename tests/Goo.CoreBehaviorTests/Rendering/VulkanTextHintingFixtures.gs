package Goo

import System
import System.Collections.Generic
import System.IO

internal class VulkanTextHintingFixtures {
    func GlyphHintingPreservesHorizontalCoordinatesAndStems() bool {
        let bytes = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf"))
        using let font = VulkanTextFont(bytes, 11u, 0u, nil, systemWeight: 400)
        let metrics = font.Metrics
        let shape = VulkanTextShapingWorkspace(8)
        let options = VulkanTextShapingOptions{}
        if font.ShapeInto("HH", options, shape).Status != VulkanTextProviderAbi.Success {
            return false
        }
        let first = shape.GlyphBuffer[0]
        let second = shape.GlyphBuffer[1]
        let workspace = VulkanTextProviderWorkspace([65536]uint8)
        if font.EncodeGlyphInto(first.GlyphId, workspace).Status != VulkanTextProviderAbi.Success {
            return false
        }
        let originalX = List[int16]()
        let originalY = SortedSet[int16]()
        ReadCurves(workspace, originalX, originalY)
        if font.EncodeGlyphInto(first.GlyphId, workspace, 11 * 64).Status != VulkanTextProviderAbi.Success {
            return false
        }
        let hintedX = List[int16]()
        let hintedY = SortedSet[int16]()
        ReadCurves(workspace, hintedX, hintedY)
        originalX.Sort()
        hintedX.Sort()
        if originalX.Count != hintedX.Count || originalX.Count == 0 {
            return false
        }
        for i in 0 ... originalX.Count {
            if originalX[i] != hintedX[i] {
                return false
            }
        }
        var lower = 0.0F
        var internalEdges = 0
        for encodedY in hintedY {
            let designY = float32(encodedY) * 0.25F
            let pixelY = designY * 11.0F / float32(workspace.GlyphScale)
            if MathF.Abs(pixelY - MathF.Round(pixelY)) > 0.003F {
                return false
            }
            if designY > float32(workspace.GlyphScale) * 0.2F && designY < float32(workspace.GlyphScale) * 0.5F {
                if internalEdges == 0 {
                    lower = pixelY
                } else if pixelY - lower < 0.99F {
                    return false
                }
                internalEdges++
            }
        }
        if internalEdges != 2 || !font.Metrics.Equals(metrics)
        || font.ShapeInto("HH", options, shape).Status != VulkanTextProviderAbi.Success {
            return false
        }
        return SamePosition(first, shape.GlyphBuffer[0]) && SamePosition(second, shape.GlyphBuffer[1])
    }

    private func SamePosition(first VulkanTextGlyph, second VulkanTextGlyph) bool ->
    first.GlyphId == second.GlyphId && first.Cluster == second.Cluster
    && first.XAdvance == second.XAdvance && first.YAdvance == second.YAdvance
    && first.XOffset == second.XOffset && first.YOffset == second.YOffset

    private func ReadCurves(workspace VulkanTextProviderWorkspace, horizontal List[int16], vertical SortedSet[int16]) {
        let bytes = workspace.ByteBuffer
        let visited = HashSet[int32]()
        let bandCount = int32(BitConverter.ToInt16(bytes, 8)) + int32(BitConverter.ToInt16(bytes, 10))
        for band in 0 ... bandCount {
            let header = 16 + band * 8
            let count = int32(BitConverter.ToInt16(bytes, header))
            let data = int32(BitConverter.ToInt16(bytes, header + 2)) + 32768
            for index in 0 ... count {
                let offset = (int32(BitConverter.ToInt16(bytes, (data + index) * 8)) + 32768) * 8
                if !visited.Add(offset) {
                    continue
                }
                horizontal.Add(BitConverter.ToInt16(bytes, offset))
                horizontal.Add(BitConverter.ToInt16(bytes, offset + 4))
                horizontal.Add(BitConverter.ToInt16(bytes, offset + 8))
                let y = BitConverter.ToInt16(bytes, offset + 2)
                if y == BitConverter.ToInt16(bytes, offset + 6) && y == BitConverter.ToInt16(bytes, offset + 10) {
                    vertical.Add(y)
                }
            }
        }
    }
}
