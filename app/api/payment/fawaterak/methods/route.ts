import { NextRequest, NextResponse } from "next/server";

const FAWATERAK_API_URL = process.env.FAWATERAK_API_URL || "https://staging.fawaterk.com/api/v2";
const FAWATERAK_API_KEY = process.env.FAWATERAK_API_KEY;

export async function GET(req: NextRequest) {
  try {
    if (!FAWATERAK_API_KEY) {
      return new NextResponse("Fawaterak API key not configured", { status: 500 });
    }

    // Check if this is a plugin proxy request
    const isPluginProxy = req.headers.get("X-Plugin-Proxy") === "true";

    // Fetch payment methods from Fawaterak
    const response = await fetch(`${FAWATERAK_API_URL}/getPaymentmethods`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${FAWATERAK_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[FAWATERAK_METHODS] Error:", errorText);
      return new NextResponse("Failed to fetch payment methods", { status: response.status });
    }

    const data = await response.json();
    
    // Log the raw response for debugging
    console.log("[FAWATERAK_METHODS_RESPONSE]", JSON.stringify(data, null, 2));

    // If this is a plugin proxy request, return raw response
    if (isPluginProxy) {
      return NextResponse.json(data);
    }

    // Otherwise, format for frontend
    const methods = (data.data || []).map((method: any, index: number) => {
      // Check multiple possible icon field names - prioritize 'logo' as it's what Fawaterak uses
      let iconUrl = method.logo || 
                     method.icon || 
                     method.image || 
                     method.icon_url || 
                     method.image_url ||
                     method.logo_url ||
                     method.iconUrl ||
                     method.imageUrl ||
                     null;
      
      // Normalize icon URL - ensure it's absolute
      let originalUrlWithoutDot = null;
      if (iconUrl) {
        const originalUrl = iconUrl;
        // Remove any whitespace
        iconUrl = iconUrl.trim();
        
        // If it's already an absolute URL, use it as is
        if (iconUrl.startsWith('http://') || iconUrl.startsWith('https://')) {
          // Already absolute, use as is
          originalUrlWithoutDot = iconUrl; // Store after making absolute
        } else if (iconUrl.startsWith('//')) {
          // Protocol-relative URL, add https:
          iconUrl = `https:${iconUrl}`;
          originalUrlWithoutDot = iconUrl; // Store after making absolute
        } else if (iconUrl.startsWith('/')) {
          // Absolute path, prepend base URL
          const baseUrl = FAWATERAK_API_URL.replace('/api/v2', '');
          iconUrl = `${baseUrl}${iconUrl}`;
          originalUrlWithoutDot = iconUrl; // Store after making absolute
        } else {
          // Relative path, prepend base URL with slash
          const baseUrl = FAWATERAK_API_URL.replace('/api/v2', '');
          iconUrl = `${baseUrl}/${iconUrl}`;
          originalUrlWithoutDot = iconUrl; // Store after making absolute
        }
        
        // Fix missing file extension - check if URL has a proper extension
        const urlLower = iconUrl.toLowerCase();
        const hasExtension = urlLower.match(/\.(png|jpg|jpeg|gif|svg|webp)(\?|$|#)/);
        
        console.log(`[FAWATERAK_METHODS] Checking extension for: ${iconUrl}, hasExtension: ${!!hasExtension}`);
        
        let urlWithDot = iconUrl;
        if (!hasExtension) {
          // Check if it ends with extension name without dot (e.g., "fawrypng" -> "fawry.png", "MC_VI_MEpng" -> "MC_VI_ME.png")
          const extensionPatterns = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'];
          let fixed = false;
          
          for (const ext of extensionPatterns) {
            // Check if URL ends with the extension (case-insensitive)
            if (urlLower.endsWith(ext) && !urlLower.endsWith('.' + ext)) {
              // Remove the extension and add it back with a dot
              // Preserve original case for the filename part
              urlWithDot = iconUrl.slice(0, -ext.length) + '.' + ext;
              fixed = true;
              console.log(`[FAWATERAK_METHODS] ✅ Fixed missing dot in extension: ${iconUrl} -> ${urlWithDot}`);
              break;
            }
          }
          
          // If still no extension found, add .png as default
          if (!fixed && !iconUrl.match(/\.(png|jpg|jpeg|gif|svg|webp)(\?|$|#)/i)) {
            urlWithDot = `${iconUrl}.png`;
            console.log(`[FAWATERAK_METHODS] Added .png extension: ${iconUrl} -> ${urlWithDot}`);
          }
        } else {
          urlWithDot = iconUrl;
          console.log(`[FAWATERAK_METHODS] ✅ URL already has proper extension: ${iconUrl}`);
        }
        
        // Use the version with dot, but also store the original without dot as a fallback
        iconUrl = urlWithDot;
        
        // Special handling for MC_VI_ME - try lowercase version first as it might be case-sensitive
        if (iconUrl.includes('MC_VI_ME')) {
          // Keep original but note that we might need to try lowercase
          console.log(`[FAWATERAK_METHODS] Card image URL: ${iconUrl}`);
        }
        
        // Try alternative paths if the original doesn't work
        // Some Fawaterak images might be in different locations
        const alternativePaths: string[] = [];
        if (iconUrl.includes('/clients/payment_options/')) {
          // Try with different casing or alternative paths
          const basePath = iconUrl.substring(0, iconUrl.lastIndexOf('/'));
          const fileName = iconUrl.substring(iconUrl.lastIndexOf('/') + 1);
          alternativePaths.push(
            `${basePath}/${fileName}`,
            `${basePath}/${fileName.toLowerCase()}`,
            `${basePath}/${fileName.toUpperCase()}`,
            iconUrl.replace('/clients/payment_options/', '/images/payment_methods/'),
            iconUrl.replace('/clients/payment_options/', '/assets/payment_methods/'),
          );
        }
        
        console.log(`[FAWATERAK_METHODS] Normalized icon URL for ${method.name_ar || method.name}: ${originalUrl} -> ${iconUrl}`);
      }
      
      const result = {
        id: `${method.id || method.paymentId || index}-${index}`,
        originalId: method.id || method.paymentId,
        name: method.name_ar || method.name_en || method.name || method.id,
        icon: iconUrl,
        iconOriginal: originalUrlWithoutDot && originalUrlWithoutDot !== iconUrl ? originalUrlWithoutDot : null,
        commission: method.commission || 0,
      };
      
      console.log(`[FAWATERAK_METHODS] Processed method: ${result.name}, Icon URL: ${result.icon}, Original: ${result.iconOriginal || 'same'}`);
      
      return result;
    });

    return NextResponse.json({ methods });
  } catch (error) {
    console.error("[FAWATERAK_METHODS]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

