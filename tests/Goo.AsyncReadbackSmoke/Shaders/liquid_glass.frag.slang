#include "goo_effect.slang"

float roundedRectDistance(float2 p, float2 size, float radius)
{
    float2 halfSize = size * 0.5;
    float r = min(max(radius, 0.0), min(halfSize.x, halfSize.y));
    float2 d = abs(p - halfSize) - (halfSize - float2(r, r));
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

float3 srgbToLinear(float3 color)
{
    float3 low = color / 12.92;
    float3 high = pow((color + 0.055) / 1.055, float3(2.4, 2.4, 2.4));
    return lerp(low, high, step(0.04045, color));
}

float4 sampleDispersed(
    float2 uv,
    float2 displacement,
    float dispersion,
    float2 minUv,
    float2 maxUv)
{
    float4 center = gooBackdropTexture.Sample(uv);
    float4 red = gooBackdropTexture.Sample(clamp(uv + displacement * dispersion, minUv, maxUv));
    float4 blue = gooBackdropTexture.Sample(clamp(uv - displacement * dispersion, minUv, maxUv));
    float alpha = max(max(red.a, center.a), blue.a);
    return float4(red.r, center.g, blue.b, alpha);
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
    float cornerAlpha = saturate(0.5 - distance);
    float edgeDistance = max(-distance, 0.0);

    float2 gradient = float2(
        roundedRectDistance(pixelPosition + float2(1.0, 0.0), hostSize, max(radius, 0.0))
            - roundedRectDistance(pixelPosition - float2(1.0, 0.0), hostSize, max(radius, 0.0)),
        roundedRectDistance(pixelPosition + float2(0.0, 1.0), hostSize, max(radius, 0.0))
            - roundedRectDistance(pixelPosition - float2(0.0, 1.0), hostSize, max(radius, 0.0)));
    float gradientLength = length(gradient);
    float2 edgeNormal = gradientLength > 0.0001 ? gradient / gradientLength : float2(0.0, -1.0);

    float bevelWidth = 22.0 * pixelScale;
    float bevel = 1.0 - smoothstep(0.0, bevelWidth, edgeDistance);
    float innerCrease = 1.0 - smoothstep(0.0, 4.0 * pixelScale, edgeDistance);
    float profile = sqrt(saturate(1.0 - pow(saturate(edgeDistance / max(bevelWidth, 0.001)), 2.0)));
    float sinIncident = saturate(profile * 0.78);
    float sinTransmitted = sinIncident / 1.45;
    float cosTransmitted = sqrt(max(1.0 - sinTransmitted * sinTransmitted, 0.001));
    float thickness = 40.0 * pixelScale;
    float opticalShift = thickness * (sinIncident - sinTransmitted) / cosTransmitted;

    float blurRadius = lerp(2.5, 6.0, saturate(controls.x)) * pixelScale;
    blurRadius = min(blurRadius, max(outsetPixels - 1.0, 0.0));
    float maximumShift = max(outsetPixels - blurRadius - 0.5, 0.0);
    opticalShift = min(opticalShift, min(maximumShift, 12.0 * pixelScale)) * bevel;
    float2 displacement = -edgeNormal * opticalShift * texel;
    float2 refractedCenter = sourceUv + displacement;
    float2 support = min(float2(blurRadius, blurRadius), max((textureSize - 1.0) * 0.5, 0.0));
    refractedCenter = clamp(refractedCenter, minUv + support * texel, maxUv - support * texel);

    float dispersion = 0.045 * bevel;
    float4 refracted = sampleDispersed(
        refractedCenter, displacement, dispersion, minUv, maxUv) * 0.22;
    float totalWeight = 0.22;
    static const int TAP_COUNT = 12;
    for (int index = 0; index < TAP_COUNT; index++)
    {
        float fraction = (float(index) + 0.5) / float(TAP_COUNT);
        float angle = float(index) * 2.39996323;
        float2 direction = float2(cos(angle), sin(angle));
        float2 tapUv = clamp(refractedCenter + direction * sqrt(fraction) * blurRadius * texel, minUv, maxUv);
        float weight = exp(-1.8 * fraction);
        refracted += sampleDispersed(
            tapUv, displacement, dispersion, minUv, maxUv) * weight;
        totalWeight += weight;
    }
    refracted /= totalWeight;

    bool configured = accentParameter.w > 0.5;
    float3 tintColor = srgbToLinear(configured ? tintParameter.rgb : float3(0.82, 0.88, 0.96));
    float opacity = configured ? saturate(tintParameter.w) : 0.78;
    float refractedAlpha = saturate(refracted.a);
    float3 backdropColor = refractedAlpha > 0.001 ? refracted.rgb / refractedAlpha : tintColor;
    float tintAmount = lerp(0.08, 0.24, saturate(controls.y));
    float luminance = dot(backdropColor, float3(0.2126, 0.7152, 0.0722));
    float separation = lerp(0.985, 0.94, saturate((luminance - 0.55) * 2.0));
    float3 glassColor = lerp(backdropColor, tintColor, tintAmount) * separation;

    float2 normalXY = edgeNormal * sinIncident;
    float normalZ = sqrt(saturate(1.0 - dot(normalXY, normalXY)));
    float3 surfaceNormal = normalize(float3(normalXY, normalZ));
    float3 lightDirection = normalize(float3(-0.42, -0.72, 0.55));
    bool pointerEnabled = accentParameter.y > 0.5
        && dot(abs(pointerParameter), float4(1.0, 1.0, 1.0, 1.0)) > 0.0001;
    if (pointerEnabled)
    {
        float2 pointerRay = pointerParameter.xy - uv;
        float pointerDistance = length(pointerRay);
        float2 pointerDirection = pointerDistance > 0.0001
            ? pointerRay / pointerDistance
            : float2(0.0, -1.0);
        float3 pointerLight = normalize(float3(pointerDirection, 0.62));
        float pointerResponse = 0.38
            + 0.10 * saturate(pointerParameter.z + pointerParameter.w);
        lightDirection = normalize(lerp(lightDirection, pointerLight, pointerResponse));
    }
    float fresnel = 0.04 + 0.96 * pow(1.0 - normalZ, 5.0);
    float directional = pow(saturate(dot(surfaceNormal, lightDirection)), 18.0);
    float rimStrength = configured ? saturate(accentParameter.x) : 0.72;
    float highlight = rimStrength * (
        fresnel * bevel * 0.10
        + directional * bevel * 0.10
        + directional * innerCrease * 0.08);
    glassColor += highlight;

    float sourceAlpha = saturate(source.a);
    float outputAlpha = saturate(sourceAlpha + opacity * (1.0 - sourceAlpha));
    float3 outputColor = source.rgb + glassColor * opacity * (1.0 - sourceAlpha);
    return float4(clamp(outputColor, 0.0, outputAlpha), outputAlpha) * cornerAlpha;
}
