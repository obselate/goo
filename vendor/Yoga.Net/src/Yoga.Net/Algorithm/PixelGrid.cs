using System;

namespace Facebook.Yoga
{
    public static class PixelGrid
    {
        public const float YGUndefined = float.NaN;

        public static float RoundValueToPixelGrid(
            double value,
            double pointScaleFactor,
            bool forceCeil,
            bool forceFloor) =>
            (float)RoundValueToPixelGridDouble(value, pointScaleFactor, forceCeil, forceFloor);

        private static double RoundValueToPixelGridDouble(
            double value,
            double pointScaleFactor,
            bool forceCeil,
            bool forceFloor)
        {
            double scaledValue = value * pointScaleFactor;
            double fractial = scaledValue % 1.0;

            if (fractial < 0)
            {
                fractial += 1.0;
            }

            if (Comparison.InexactEquals(fractial, 0.0))
            {
                scaledValue = scaledValue - fractial;
            }
            else if (Comparison.InexactEquals(fractial, 1.0))
            {
                scaledValue = scaledValue - fractial + 1.0;
            }
            else if (forceCeil)
            {
                scaledValue = scaledValue - fractial + 1.0;
            }
            else if (forceFloor)
            {
                scaledValue = scaledValue - fractial;
            }
            else
            {
                scaledValue = scaledValue - fractial +
                    (!double.IsNaN(fractial) &&
                         (fractial > 0.5 || Comparison.InexactEquals(fractial, 0.5))
                     ? 1.0
                     : 0.0);
            }

            return (double.IsNaN(scaledValue) || double.IsNaN(pointScaleFactor))
                ? double.NaN
                : scaledValue / pointScaleFactor;
        }

        public static void RoundLayoutResultsToPixelGrid(
            Node node,
            double absoluteLeft,
            double absoluteTop)
        {
            var pointScaleFactor = (double)node.GetConfig()!.GetPointScaleFactor();

            var layout = node.GetLayout();
            double nodeLeft = layout.RawLeft;
            double nodeTop = layout.RawTop;

            double nodeWidth = layout.RawDimension(Dimension.Width);
            double nodeHeight = layout.RawDimension(Dimension.Height);

            double absoluteNodeLeft = absoluteLeft + nodeLeft;
            double absoluteNodeTop = absoluteTop + nodeTop;

            double absoluteNodeRight = absoluteNodeLeft + nodeWidth;
            double absoluteNodeBottom = absoluteNodeTop + nodeHeight;

            if (pointScaleFactor != 0.0)
            {
                bool textRounding = node.GetNodeType() == NodeType.Text;
                bool parentTextRounding = node.GetOwner()?.GetNodeType() == NodeType.Text;

                layout.SetRoundedPosition(
                    (float)(RoundValueToPixelGridDouble(absoluteNodeLeft, pointScaleFactor, false, textRounding) -
                        RoundValueToPixelGridDouble(absoluteLeft, pointScaleFactor, false, parentTextRounding)),
                    (float)(RoundValueToPixelGridDouble(absoluteNodeTop, pointScaleFactor, false, textRounding) -
                        RoundValueToPixelGridDouble(absoluteTop, pointScaleFactor, false, parentTextRounding)));

                double scaledNodeWith = nodeWidth * pointScaleFactor;
                bool hasFractionalWidth =
                    !Comparison.InexactEquals(Math.Round(scaledNodeWith), scaledNodeWith);

                double scaledNodeHeight = nodeHeight * pointScaleFactor;
                bool hasFractionalHeight =
                    !Comparison.InexactEquals(Math.Round(scaledNodeHeight), scaledNodeHeight);

                double roundedWidth =
                    RoundValueToPixelGridDouble(
                        absoluteNodeRight,
                        pointScaleFactor,
                        (textRounding && hasFractionalWidth),
                        (textRounding && !hasFractionalWidth)) -
                    RoundValueToPixelGridDouble(
                        absoluteNodeLeft, pointScaleFactor, false, textRounding);
                double roundedHeight =
                    RoundValueToPixelGridDouble(
                        absoluteNodeBottom,
                        pointScaleFactor,
                        (textRounding && hasFractionalHeight),
                        (textRounding && !hasFractionalHeight)) -
                    RoundValueToPixelGridDouble(
                        absoluteNodeTop, pointScaleFactor, false, textRounding);

                node.GetLayout().SetDimension(
                    Dimension.Width,
                    (float)(roundedWidth == 0.0 && hasFractionalWidth && scaledNodeWith > 0.0
                        ? 1.0 / pointScaleFactor : roundedWidth));

                node.GetLayout().SetDimension(
                    Dimension.Height,
                    (float)(roundedHeight == 0.0 && hasFractionalHeight && scaledNodeHeight > 0.0
                        ? 1.0 / pointScaleFactor : roundedHeight));
            }

            var childCount = node.GetChildCount();
            for (nuint index = 0; index < childCount; index++)
            {
                var child = node.GetChild(index)!;
                RoundLayoutResultsToPixelGrid(child, absoluteNodeLeft, absoluteNodeTop);
            }
        }
    }
}
