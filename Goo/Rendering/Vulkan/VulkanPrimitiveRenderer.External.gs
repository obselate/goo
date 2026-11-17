package Goo

internal unsafe partial class VulkanPrimitiveRenderer {
    private func ApplyExternalFrame(push *VulkanPrimitiveGpuRecord, frame ExternalFrameLease,
        value CachedImageRefRecord, transform PrimitiveTransform, extent VkExtent2D) {
        let crop = frame.Description
        let orientation = crop.Orientation
        var x = value.SourceX
        var y = value.SourceY
        var width = value.SourceWidth
        var height = value.SourceHeight
        if orientation >= 5 {
            x = value.SourceY
            y = value.SourceX
            width = value.SourceHeight
            height = value.SourceWidth
        }
        if orientation == 2 || orientation == 3 || orientation == 7 || orientation == 8 { x = 1.0F - x - width }
        if orientation == 3 || orientation == 4 || orientation == 6 || orientation == 7 { y = 1.0F - y - height }
        push -> params_x = (float32(crop.X) + x * float32(crop.Width)) / float32(frame.Image.Width)
        push -> params_y = (float32(crop.Y) + y * float32(crop.Height)) / float32(frame.Image.Height)
        push -> params_z = width * float32(crop.Width) / float32(frame.Image.Width)
        push -> params_w = height * float32(crop.Height) / float32(frame.Image.Height)
        let orientationTransform = switch orientation {
            case 2: PrimitiveTransform{ A: -1.0F, D: 1.0F, TX: 1.0F }
            case 3: PrimitiveTransform{ A: -1.0F, D: -1.0F, TX: 1.0F, TY: 1.0F }
            case 4: PrimitiveTransform{ A: 1.0F, D: -1.0F, TY: 1.0F }
            case 5: PrimitiveTransform{ B: 1.0F, C: 1.0F }
            case 6: PrimitiveTransform{ B: 1.0F, C: -1.0F, TX: 1.0F }
            case 7: PrimitiveTransform{ B: -1.0F, C: -1.0F, TX: 1.0F, TY: 1.0F }
            case 8: PrimitiveTransform{ B: -1.0F, C: 1.0F, TY: 1.0F }
            default: PrimitiveTransform{ A: 1.0F, D: 1.0F }
        }
        let bounds = value.Bounds
        let parent = LocalizeTransform(transform)
        let originX = bounds.X + bounds.Width * orientationTransform.TX
        let originY = bounds.Y + bounds.Height * orientationTransform.TY
        let ax = bounds.Width * orientationTransform.A
        let ay = bounds.Height * orientationTransform.B
        let bx = bounds.Width * orientationTransform.C
        let by = bounds.Height * orientationTransform.D
        let geometry = &(push -> Geometry)
        geometry -> rect_x = 0.0F
        geometry -> rect_y = 0.0F
        geometry -> rect_z = 1.0F
        geometry -> rect_w = 1.0F
        geometry -> transform0_x = 2.0F * (parent.A * ax + parent.C * ay) / float32(extent.width)
        geometry -> transform0_y = 2.0F * (parent.A * bx + parent.C * by) / float32(extent.width)
        geometry -> transform0_z = 2.0F * (parent.A * originX + parent.C * originY + parent.TX) / float32(extent.width) - 1.0F
        geometry -> transform1_x = 2.0F * (parent.B * ax + parent.D * ay) / float32(extent.height)
        geometry -> transform1_y = 2.0F * (parent.B * bx + parent.D * by) / float32(extent.height)
        geometry -> transform1_z = 2.0F * (parent.B * originX + parent.D * originY + parent.TY) / float32(extent.height) - 1.0F
    }
}
