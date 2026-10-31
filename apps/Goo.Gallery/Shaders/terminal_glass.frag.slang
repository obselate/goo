#include "goo_effect.slang"

float hash21(float2 value)
{
    float3 p = frac(float3(value.xyx) * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return frac((p.x + p.y) * p.z);
}

float roundedRectDistance(float2 p, float2 size, float radius)
{
    float2 halfSize = size * 0.5;
    float r = min(max(radius, 0.0), min(halfSize.x, halfSize.y));
    float2 d = abs(p - halfSize) - (halfSize - float2(r, r));
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

float4 gooEffect(float2 uv, float4 source, float4 backdrop)
{
    float4 controls = gooParameter(2);
    float4 pointerParameter = gooParameter(1);
    float4 tintParameter = gooParameter(3);
    float4 accentParameter = gooParameter(4);
    GooPrimitiveRecord primitive = gooPrimitive();

    uint textureWidth;
    uint textureHeight;
    gooBackdropTexture.GetDimensions(textureWidth, textureHeight);
    float2 textureSize = float2(max(textureWidth, 1u), max(textureHeight, 1u));
    float2 texel = 1.0 / textureSize;
    float2 minUv = 0.5 * texel;
    float2 maxUv = 1.0 - minUv;
    float2 sourceUv = primitive.params.xy + uv * primitive.params.zw;

    float2 lowerOutset = primitive.params.xy * textureSize;
    float2 upperOutset = (1.0 - primitive.params.xy - primitive.params.zw) * textureSize;
    float outsetPixels = max(min(min(lowerOutset.x, lowerOutset.y), min(upperOutset.x, upperOutset.y)), 0.0);
    float pixelScale = clamp(outsetPixels / 24.0, 0.75, 3.0);

    float2 hostSize = max(primitive.rect.zw, float2(1.0, 1.0));
    float2 pixelPosition = uv * hostSize;
    float radius = controls.w < -0.5 ? -1.0 : max(controls.w, 0.0) * pixelScale;
    float distance = radius < 0.0
        ? -min(min(pixelPosition.x, hostSize.x - pixelPosition.x), min(pixelPosition.y, hostSize.y - pixelPosition.y))
        : roundedRectDistance(pixelPosition, hostSize, radius);
    float antialiasWidth = max(fwidth(distance), 0.001);
    float cornerAlpha = 1.0 - smoothstep(
        -0.5 * antialiasWidth,
        0.5 * antialiasWidth,
        distance);
    float edgeDistance = max(-distance, 0.0);

    float2 gradient = float2(
        roundedRectDistance(pixelPosition + float2(1.0, 0.0), hostSize, max(radius, 0.0))
            - roundedRectDistance(pixelPosition - float2(1.0, 0.0), hostSize, max(radius, 0.0)),
        roundedRectDistance(pixelPosition + float2(0.0, 1.0), hostSize, max(radius, 0.0))
            - roundedRectDistance(pixelPosition - float2(0.0, 1.0), hostSize, max(radius, 0.0)));
    float gradientLength = length(gradient);
    float2 edgeNormal = gradientLength > 0.0001 ? gradient / gradientLength : float2(0.0, -1.0);
    float bevel = 1.0 - smoothstep(0.0, 3.5 * pixelScale, edgeDistance);

    float blurControl = saturate(controls.x);
    float blurRadius = min(lerp(0.5, 2.0, blurControl) * pixelScale, max(outsetPixels - 1.0 * pixelScale - 0.5, 0.0));
    float lensDistance = min(lerp(0.25, 0.75, blurControl) * pixelScale, max(outsetPixels - blurRadius - 0.5, 0.0));
    float2 refractedCenter = sourceUv - edgeNormal * (bevel * lensDistance) * texel;
    float2 support = min(float2(blurRadius, blurRadius), max((textureSize - 1.0) * 0.5, 0.0));
    refractedCenter = clamp(refractedCenter, minUv + support * texel, maxUv - support * texel);

    float4 blurred = gooBackdropTexture.Sample(refractedCenter) * 0.18;
    float totalWeight = 0.18;
    static const int TAP_COUNT = 16;
    for (int index = 0; index < TAP_COUNT; index++)
    {
        float fraction = (float(index) + 0.5) / float(TAP_COUNT);
        float angle = float(index) * 2.39996323;
        float2 direction = float2(cos(angle), sin(angle));
        float2 tapUv = clamp(refractedCenter + direction * sqrt(fraction) * blurRadius * texel, minUv, maxUv);
        float weight = exp(-1.65 * fraction);
        blurred += gooBackdropTexture.Sample(tapUv) * weight;
        totalWeight += weight;
    }
    blurred /= totalWeight;

    bool configured = accentParameter.w > 0.5;
    float3 tintColor = configured ? tintParameter.rgb : float3(0.018, 0.030, 0.048);
    float opacity = configured ? saturate(tintParameter.w) : 0.92;
    float blurredAlpha = saturate(blurred.a);
    float3 backdropColor = blurredAlpha > 0.001 ? blurred.rgb / blurredAlpha : tintColor;
    float3 transmittedLight = lerp(
        float3(0.035, 0.060, 0.090),
        float3(0.012, 0.028, 0.055),
        saturate(controls.y));
    float3 glassColor = blurredAlpha > 0.001
        ? tintColor + backdropColor * transmittedLight
        : tintColor;

    float noise = (hash21(floor(pixelPosition)) - 0.5) * 0.004 * saturate(controls.z);
    glassColor = max(glassColor + noise, 0.0);

    float2 normalXY = edgeNormal * (bevel * 0.62);
    float normalZ = sqrt(saturate(1.0 - dot(normalXY, normalXY)));
    float3 surfaceNormal = normalize(float3(normalXY, normalZ));
    float3 lightDirection = normalize(float3(-0.45, -0.65, 0.62));
    bool pointerEnabled = accentParameter.y > 0.5
        && dot(abs(pointerParameter), float4(1.0, 1.0, 1.0, 1.0)) > 0.0001;
    if (pointerEnabled)
    {
        float2 pointerRay = pointerParameter.xy - uv;
        float pointerDistance = length(pointerRay);
        float2 pointerDirection = pointerDistance > 0.0001
            ? pointerRay / pointerDistance
            : float2(0.0, -1.0);
        float3 pointerLight = normalize(float3(pointerDirection, 0.72));
        lightDirection = normalize(lerp(lightDirection, pointerLight, 0.14));
    }
    float fresnel = pow(1.0 - normalZ, 5.0);
    float directional = pow(saturate(dot(surfaceNormal, lightDirection)), 12.0);
    float rimStrength = configured ? saturate(accentParameter.x) : 0.45;
    float outline = 1.0 - smoothstep(
        0.0,
        max(1.0 * pixelScale, antialiasWidth),
        edgeDistance);
    float highlight = rimStrength * bevel * (0.004 + fresnel * 0.018 + directional * 0.014);
    highlight += rimStrength * outline * 0.012;
    glassColor += highlight;

    float sourceAlpha = saturate(source.a);
    float outputAlpha = saturate(sourceAlpha + opacity * (1.0 - sourceAlpha));
    float3 outputColor = source.rgb + glassColor * opacity * (1.0 - sourceAlpha);
    return float4(clamp(outputColor, 0.0, outputAlpha), outputAlpha) * cornerAlpha;
}
