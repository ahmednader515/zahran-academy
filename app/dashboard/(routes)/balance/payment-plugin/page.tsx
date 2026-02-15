"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

declare global {
  interface Window {
    jQuery: any;
    fawaterkCheckout: any;
    fawaterk: any;
    Fawaterk: any;
  }
}

function PaymentPluginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { data: session } = useSession();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scriptsReady, setScriptsReady] = useState(false);
  
  const pluginInitialized = useRef(false);
  const scriptLoaded = useRef(false);
  const originalFetch = useRef<typeof fetch | null>(null);
  const originalXHR = useRef<typeof XMLHttpRequest | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeLoaded = useRef(false);

  const amount = searchParams.get("amount");
  const paymentId = searchParams.get("paymentId");

  // Step 1: Load jQuery, then Fawaterak plugin script
  useEffect(() => {
    if (!amount || !paymentId || !session?.user || scriptsReady) {
      return;
    }

    const loadScripts = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Step 1: Load jQuery (required dependency)
        await new Promise<void>((resolve, reject) => {
          // Check if jQuery is already loaded
          if (window.jQuery) {
            console.log("[FAWATERAK] jQuery already loaded");
            resolve();
            return;
          }

          const jqueryScript = document.createElement("script");
          jqueryScript.src = "https://staging.fawaterk.com/assets_new/vendor/jquery/dist/jquery.min.js";
          jqueryScript.async = true;
          jqueryScript.onload = () => {
            console.log("[FAWATERAK] jQuery loaded successfully");
            resolve();
          };
          jqueryScript.onerror = () => {
            reject(new Error("فشل تحميل مكتبة jQuery المطلوبة"));
          };
          document.body.appendChild(jqueryScript);
        });

        // Step 2: Load Fawaterak plugin after jQuery is ready
        await new Promise<void>((resolve, reject) => {
          // Check if plugin is already loaded
          if (window.fawaterkCheckout || window.fawaterk?.checkout || window.jQuery?.fn?.fawaterk) {
            console.log("[FAWATERAK] Plugin already loaded");
            scriptLoaded.current = true;
            setScriptsReady(true);
            resolve();
            return;
          }

          const pluginScript = document.createElement("script");
          pluginScript.src = "https://staging.fawaterk.com/fawaterkPlugin/fawaterkPlugin.min.js?v=1.2";
          pluginScript.async = true;
          pluginScript.onload = () => {
            console.log("[FAWATERAK] Plugin script loaded");
            // Wait a bit for the plugin to initialize
            setTimeout(() => {
              if (window.fawaterkCheckout) {
                scriptLoaded.current = true;
                setScriptsReady(true);
                resolve();
              } else {
                // Try alternative function names
                const checkFunction = () => {
                  if (window.fawaterkCheckout || 
                      window.fawaterk?.checkout || 
                      window.jQuery?.fn?.fawaterk) {
                    scriptLoaded.current = true;
                    setScriptsReady(true);
                    resolve();
                  } else {
                    setTimeout(checkFunction, 100);
                  }
                };
                checkFunction();
              }
            }, 500);
          };
          pluginScript.onerror = () => {
            reject(new Error("فشل تحميل مكون Fawaterak"));
          };
          document.body.appendChild(pluginScript);
        });

        setIsLoading(false);
      } catch (err: any) {
        console.error("[FAWATERAK] Script loading error:", err);
        setError(err.message || "حدث خطأ أثناء تحميل المكونات المطلوبة");
        setIsLoading(false);
      }
    };

    loadScripts();
  }, [amount, paymentId, session]);

  // Step 4: Set up fetch interception to proxy API calls
  useEffect(() => {
    if (!scriptsReady) return;

    // Store original fetch with proper binding
    if (!originalFetch.current) {
      originalFetch.current = window.fetch.bind(window);
    }

    // Intercept fetch calls
    window.fetch = async (...args) => {
      const url = args[0] as string;
      const requestInit = args[1] as RequestInit | undefined;

      // Check if this is a Fawaterak API call
      if (typeof url === 'string' && url.includes('fawaterk.com') && url.includes('/api/v2/')) {
        try {
          const urlObj = new URL(url);
          // Extract endpoint
          const endpoint = urlObj.pathname.split('/api/v2/')[1] || urlObj.pathname;
          
          console.log("[FAWATERAK_PROXY] Intercepting API call:", endpoint, "Full URL:", url);

          // Route to appropriate backend endpoint
          let proxyUrl = '';
          if (endpoint.includes('getPaymentmethods') || endpoint.includes('getPaymentMethods') || endpoint.includes('paymentmethods')) {
            proxyUrl = '/api/payment/fawaterak/methods';
          } else if (endpoint.includes('createInvoice') || 
                     endpoint.includes('invoiceInitPay') || 
                     endpoint.includes('invoiceInit') ||
                     endpoint.includes('initPay') ||
                     endpoint.includes('initPayment') ||
                     endpoint.includes('invoice') ||
                     endpoint.includes('pay')) {
            proxyUrl = '/api/payment/fawaterak/create';
          } else {
            // Log unhandled endpoints for debugging
            console.warn("[FAWATERAK_PROXY] Unhandled endpoint, using original fetch:", endpoint, "Full URL:", url);
            // For other endpoints, try to proxy through create endpoint as fallback
            // This handles cases where the plugin uses different endpoint names
            console.log("[FAWATERAK_PROXY] Attempting to proxy through create endpoint as fallback");
            proxyUrl = '/api/payment/fawaterak/create';
          }

          // Get request body
          let requestBody = null;
          if (requestInit?.body) {
            if (typeof requestInit.body === 'string') {
              requestBody = requestInit.body;
            } else {
              requestBody = JSON.stringify(requestInit.body);
            }
          }

          console.log("[FAWATERAK_PROXY] Proxying to:", proxyUrl, "Method:", requestInit?.method || 'GET', "Body:", requestBody);

          // Proxy the request through our backend using original fetch to avoid recursion
          const proxyResponse = await originalFetch.current(proxyUrl, {
            method: requestInit?.method || 'GET',
            headers: {
              "X-Plugin-Proxy": "true", // Signal this is from plugin
              "Content-Type": "application/json",
              "X-Original-URL": url, // Pass original URL for endpoint detection
              // Preserve original headers that might be needed
              ...(requestInit?.headers as Record<string, string> || {}),
            },
            body: requestBody,
          });

          if (!proxyResponse.ok) {
            const errorText = await proxyResponse.text();
            console.error("[FAWATERAK_PROXY] Error response:", proxyResponse.status, errorText);
            // Return error response in format plugin expects
            return new Response(JSON.stringify({ error: errorText }), {
              status: proxyResponse.status,
              headers: { "Content-Type": "application/json" },
            });
          }

          const responseData = await proxyResponse.json();
          console.log("[FAWATERAK_PROXY] Success response:", responseData);

          // Return response in format plugin expects (preserve original response structure)
          return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: { 
              "Content-Type": "application/json",
              // Preserve any important headers from the proxy response
            },
          });
        } catch (err: any) {
          console.error("[FAWATERAK_PROXY] Proxy error:", err);
          // Fallback to original fetch on error
          return originalFetch.current(...args);
        }
      }

      // For non-Fawaterak requests, use original fetch
      return originalFetch.current(...args);
    };

    // Also intercept XMLHttpRequest (plugin might use it)
    if (!originalXHR.current) {
      originalXHR.current = window.XMLHttpRequest;
    }

    const XHRProxy = function(this: XMLHttpRequest) {
      const xhr = new originalXHR.current!();
      const originalOpen = xhr.open;
      const originalSend = xhr.send;

      xhr.open = function(method: string, url: string | URL, ...rest: any[]) {
        const urlString = typeof url === 'string' ? url : url.toString();
        
        // Check if this is a Fawaterak API call
        if (urlString.includes('fawaterk.com') && urlString.includes('/api/v2/')) {
          const urlObj = typeof url === 'string' ? new URL(url) : url;
          const endpoint = urlObj.pathname.split('/api/v2/')[1] || urlObj.pathname;
          
          console.log("[FAWATERAK_PROXY] Intercepting XHR call:", endpoint, "Full URL:", urlString);

          // Route to appropriate backend endpoint
          let proxyUrl = '';
          if (endpoint.includes('getPaymentmethods') || endpoint.includes('getPaymentMethods') || endpoint.includes('paymentmethods')) {
            proxyUrl = '/api/payment/fawaterak/methods';
          } else if (endpoint.includes('createInvoice') || 
                     endpoint.includes('invoiceInitPay') || 
                     endpoint.includes('invoiceInit') ||
                     endpoint.includes('initPay') ||
                     endpoint.includes('initPayment')) {
            proxyUrl = '/api/payment/fawaterak/create';
          }

          if (proxyUrl) {
            // Override the URL
            return originalOpen.call(this, method, proxyUrl, ...rest);
          }
        }
        
        return originalOpen.call(this, method, url, ...rest);
      };

      xhr.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
        // Add plugin proxy header
        xhr.setRequestHeader('X-Plugin-Proxy', 'true');
        if (!xhr.getResponseHeader('Content-Type')) {
          xhr.setRequestHeader('Content-Type', 'application/json');
        }
        return originalSend.call(this, body);
      };

      return xhr;
    } as any;

    // Replace XMLHttpRequest
    window.XMLHttpRequest = XHRProxy as any;

    // Cleanup: restore original fetch and XHR on unmount
    return () => {
      if (originalFetch.current) {
        window.fetch = originalFetch.current;
      }
      if (originalXHR.current) {
        window.XMLHttpRequest = originalXHR.current;
      }
    };
  }, [scriptsReady]);

  // Helper functions and applyDarkStyling - defined outside useEffect so they can be reused
  const isLightColor = (color: string): boolean => {
      if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return false;
      
      // Check for common light colors
      const lightColors = [
        'white', '#ffffff', '#fff', 'rgb(255, 255, 255)', 'rgba(255, 255, 255',
        '#f9fafb', '#f3f4f6', '#e5e7eb', '#d1d5db', '#9ca3af', // light grays
        '#fafafa', '#f5f5f5', '#eeeeee', '#e0e0e0', '#f0f0f0', // very light grays
        'rgb(249, 250, 251)', 'rgb(243, 244, 246)', 'rgb(229, 231, 235)', 'rgb(209, 213, 219)',
        '#fefefe', '#fdfdfd', '#fcfcfc', '#fbfbfb', // off-whites
      ];
      
    const colorLower = color.toLowerCase().trim();
    return lightColors.some(light => colorLower.includes(light));
  };

  const isDarkText = (color: string): boolean => {
      if (!color || color === 'transparent') return false;
      
      // Check for dark text colors (black, dark grays)
      const darkColors = [
        'black', '#000000', '#000', 'rgb(0, 0, 0)', 'rgb(0,0,0)', 'rgba(0, 0, 0',
        '#111111', '#222222', '#333333', '#1a1a1a', '#2a2a2a', '#3a3a3a',
        'rgb(17, 24, 39)', 'rgb(31, 41, 55)', 'rgb(55, 65, 81)', 'rgb(75, 85, 99)',
        'rgb(107, 114, 128)', 'rgb(156, 163, 175)', // dark to medium grays
        '#171717', '#262626', '#404040', '#525252', '#737373',
      ];
      
    const colorLower = color.toLowerCase().trim();
    return darkColors.some(dark => colorLower.includes(dark));
  };

  const isPureBlack = (color: string): boolean => {
      if (!color || color === 'transparent') return false;
      
      const colorLower = color.toLowerCase().trim();
      // Check for pure black colors
      return colorLower === '#000000' || 
             colorLower === '#000' || 
             colorLower === 'rgb(0, 0, 0)' || 
             colorLower === 'rgb(0,0,0)' ||
             colorLower.startsWith('rgba(0, 0, 0,') ||
             colorLower.startsWith('rgba(0,0,0,') ||
             colorLower === 'black';
  };

  const applyDarkStyling = () => {
      // Only apply to the payment container - don't touch navbar, sidebar, or other page elements
      if (!containerRef.current) return;
      
      const container = containerRef.current;
      
      // Check if element is within our payment container (not navbar/sidebar)
      const isWithinPaymentContainer = (el: HTMLElement): boolean => {
        return container.contains(el) && 
               !el.closest('nav') && 
               !el.closest('[class*="navbar"]') && 
               !el.closest('[class*="sidebar"]') &&
               !el.closest('[class*="Navbar"]') &&
               !el.closest('[class*="Sidebar"]');
      };
      
      // Apply to container itself
      container.style.backgroundColor = 'hsl(var(--background))';
      container.style.color = 'hsl(var(--foreground))';
      
      // Find the Card component that contains our container
      const cardElement = container.closest('[class*="card"], [class*="Card"]');
      if (cardElement && isWithinPaymentContainer(cardElement as HTMLElement)) {
        const htmlCard = cardElement as HTMLElement;
        const computedStyle = window.getComputedStyle(htmlCard);
        if (isLightColor(computedStyle.backgroundColor)) {
          htmlCard.style.backgroundColor = 'hsl(var(--card))';
        }
        if (isLightColor(computedStyle.color)) {
          htmlCard.style.color = 'hsl(var(--card-foreground))';
        }
      }

      // Apply dark background to any iframes (just the iframe element, not its content)
      const iframes = container.querySelectorAll('iframe');
      iframes.forEach((iframe) => {
        iframe.style.backgroundColor = 'transparent';
        // Don't try to access iframe content - it's cross-origin
      });

      // Apply dark styling to all elements in container ONLY (excluding iframe content and page elements)
      const allElements = container.querySelectorAll('*:not(iframe)');
      allElements.forEach((element) => {
        const el = element as HTMLElement;
        
        // Skip if this element is inside an iframe (shouldn't happen, but safety check)
        if (el.closest('iframe')) {
          return;
        }
        
        // Skip if this is an iframe itself (already handled above)
        if (el.tagName === 'IFRAME') {
          return;
        }
        
        // Skip if element is outside our container (navbar, sidebar, etc.)
        if (!isWithinPaymentContainer(el)) {
          return;
        }
        
        try {
          const computedStyle = window.getComputedStyle(el);
          const bgColor = computedStyle.backgroundColor;
          const textColor = computedStyle.color;

          // Replace light backgrounds
          if (isLightColor(bgColor)) {
            el.style.backgroundColor = 'hsl(var(--background))';
          }

          // Replace dark text colors (but keep brand colors)
          const hasDarkBackground = !isLightColor(bgColor);
          
          // Replace pure black with white
          if (isPureBlack(textColor) && 
              !el.classList.toString().includes('brand') && 
              !el.classList.toString().includes('text-brand')) {
            el.style.color = '#FFFFFF';
          }
          // Always replace dark text, especially on dark backgrounds
          else if (isDarkText(textColor) && 
              !el.classList.toString().includes('brand') && 
              !el.classList.toString().includes('text-brand')) {
            el.style.color = 'hsl(var(--foreground))';
          }
          
          // Also replace light text on dark backgrounds
          if (hasDarkBackground && isLightColor(textColor) && 
              !el.classList.toString().includes('brand') && 
              !el.classList.toString().includes('text-brand')) {
            el.style.color = 'hsl(var(--foreground))';
          }
          
          // Replace pure black backgrounds with dark theme background
          if (isPureBlack(bgColor)) {
            el.style.backgroundColor = 'hsl(var(--background))';
          }

          // Replace light borders
          const borderColor = computedStyle.borderColor;
          if (isLightColor(borderColor)) {
            el.style.borderColor = 'hsl(var(--border))';
          }
        } catch (e) {
          // Ignore errors (might be cross-origin iframe content)
          console.debug('[FAWATERAK] Could not style element:', e);
        }
      });

      // Specifically target common light-colored elements with inline styles (exclude iframes)
      const lightElements = container.querySelectorAll('[style*="background"]:not(iframe), [style*="color"]:not(iframe)');
      lightElements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        
        // Skip iframes and elements inside iframes
        if (htmlEl.tagName === 'IFRAME' || htmlEl.closest('iframe')) {
          return;
        }
        
        // Skip if element is outside our container
        if (!isWithinPaymentContainer(htmlEl)) {
          return;
        }
        
        try {
          const style = htmlEl.getAttribute('style') || '';
          
          // Replace white/light backgrounds in inline styles
          if (style.includes('background') && (style.includes('white') || style.includes('#fff') || style.includes('255, 255, 255') || style.includes('#f9fafb') || style.includes('#f3f4f6'))) {
            htmlEl.style.backgroundColor = 'hsl(var(--background))';
          }
          
          // Replace white/light text in inline styles
          if (style.includes('color') && (style.includes('white') || style.includes('#fff') || style.includes('255, 255, 255'))) {
            htmlEl.style.color = 'hsl(var(--foreground))';
          }
          
          // Replace pure black (#000000, #000, rgb(0,0,0)) with white
          if (style.includes('color') && (style.includes('#000000') || style.includes('#000') || style.includes('rgb(0, 0, 0)') || style.includes('rgb(0,0,0)'))) {
            if (!htmlEl.classList.toString().includes('brand') && !htmlEl.classList.toString().includes('text-brand')) {
              htmlEl.style.color = '#FFFFFF';
            }
          }
          // Replace other black/dark text in inline styles
          else if (style.includes('color') && (style.includes('black') || style.includes('0, 0, 0') || style.includes('rgb(17, 24, 39)') || style.includes('rgb(31, 41, 55)'))) {
            if (!htmlEl.classList.toString().includes('brand') && !htmlEl.classList.toString().includes('text-brand')) {
              htmlEl.style.color = 'hsl(var(--foreground))';
            }
          }
          
          // Replace pure black backgrounds in inline styles
          if (style.includes('background') && (style.includes('#000000') || style.includes('#000') || style.includes('rgb(0, 0, 0)') || style.includes('rgb(0,0,0)'))) {
            htmlEl.style.backgroundColor = 'hsl(var(--background))';
          }
        } catch (e) {
          // Ignore errors
          console.debug('[FAWATERAK] Could not process inline styles:', e);
        }
      });
  };

  // Apply dark background styling to plugin container, page, and footer
  useEffect(() => {
    // Apply immediately
    applyDarkStyling();

    // Use MutationObserver to apply styling ONLY within the payment container
    // Don't observe the entire document - only the container to avoid affecting navbar/sidebar
    const observer = new MutationObserver((mutations) => {
      // Check if mutation is from iframe content (which we can't style)
      const hasIframeMutation = mutations.some(mutation => {
        const target = mutation.target as HTMLElement;
        return target.tagName === 'IFRAME' || target.closest('iframe');
      });
      
      // Check if mutation is from navbar/sidebar (which we shouldn't touch)
      const hasNavbarSidebarMutation = mutations.some(mutation => {
        const target = mutation.target as HTMLElement;
        return target.closest('nav') || 
               target.closest('[class*="navbar"]') || 
               target.closest('[class*="sidebar"]') ||
               target.closest('[class*="Navbar"]') ||
               target.closest('[class*="Sidebar"]');
      });
      
      // Only apply styling if it's within our container and not from iframe/navbar/sidebar
      if (!hasIframeMutation && !hasNavbarSidebarMutation && containerRef.current) {
        // Double check the mutation is within our container
        const isWithinContainer = mutations.some(mutation => {
          const target = mutation.target as HTMLElement;
          return containerRef.current?.contains(target);
        });
        
        if (isWithinContainer) {
          applyDarkStyling();
        }
      }
    });

    // ONLY observe the payment container - NOT the entire document
    if (containerRef.current) {
      observer.observe(containerRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class'],
      });
    }

    // Also apply periodically but only to the container
    // Use higher frequency after iframe loads
    const getIntervalDelay = () => {
      return iframeLoaded.current ? 200 : 1000; // More frequent after iframe loads
    };
    
    const interval = setInterval(() => {
      if (containerRef.current) {
        applyDarkStyling();
      }
    }, getIntervalDelay());

    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, [scriptsReady]);
  
  // Detect when iframe loads and apply styling more aggressively
  useEffect(() => {
    if (!containerRef.current || !scriptsReady) return;

    const checkIframeLoad = () => {
      const iframes = containerRef.current?.querySelectorAll('iframe') || [];
      
      iframes.forEach((iframe) => {
        // Check if iframe has loaded
        if (!iframeLoaded.current) {
          // For cross-origin iframes, we can't access content, but we can detect when they're added
          // Mark as loaded if iframe exists and has src or is visible
          if (iframe.src || iframe.getAttribute('src') || iframe.style.display !== 'none') {
            iframeLoaded.current = true;
            console.log('[FAWATERAK] Iframe detected, applying aggressive styling');
            
            // Apply styling immediately after iframe loads
            setTimeout(() => {
              applyDarkStyling();
            }, 100);
            
            // Apply styling multiple times after iframe loads (more aggressive)
            for (let i = 1; i <= 10; i++) {
              setTimeout(() => {
                applyDarkStyling();
              }, 200 * i);
            }
            
            // Also apply every 200ms for the next 5 seconds
            const aggressiveInterval = setInterval(() => {
              applyDarkStyling();
            }, 200);
            
            setTimeout(() => {
              clearInterval(aggressiveInterval);
            }, 5000);
          }
        }
      });
    };

    // Check for iframes periodically
    const iframeCheckInterval = setInterval(checkIframeLoad, 500);
    
    // Also check when new iframes are added
    const iframeObserver = new MutationObserver(() => {
      checkIframeLoad();
    });

    if (containerRef.current) {
      iframeObserver.observe(containerRef.current, {
        childList: true,
        subtree: true,
      });
    }

    // Initial check
    checkIframeLoad();

    return () => {
      clearInterval(iframeCheckInterval);
      iframeObserver.disconnect();
    };
  }, [scriptsReady]);

  // Protect page layout from iframe interference
  useEffect(() => {
    // Store original body and html styles
    const originalBodyStyle = {
      margin: document.body.style.margin,
      padding: document.body.style.padding,
      overflow: document.body.style.overflow,
      position: document.body.style.position,
    };
    
    const originalHtmlStyle = {
      margin: document.documentElement.style.margin,
      padding: document.documentElement.style.padding,
      overflow: document.documentElement.style.overflow,
    };

    // Monitor for style changes on body and html
    const styleObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const target = mutation.target as HTMLElement;
          
          // If body or html styles are modified, restore them
          if (target === document.body || target === document.documentElement) {
            if (target === document.body) {
              document.body.style.margin = originalBodyStyle.margin || '';
              document.body.style.padding = originalBodyStyle.padding || '';
              document.body.style.overflow = originalBodyStyle.overflow || '';
              document.body.style.position = originalBodyStyle.position || '';
            } else if (target === document.documentElement) {
              document.documentElement.style.margin = originalHtmlStyle.margin || '';
              document.documentElement.style.padding = originalHtmlStyle.padding || '';
              document.documentElement.style.overflow = originalHtmlStyle.overflow || '';
            }
          }
        }
      });
    });

    // Observe body and html for style changes
    styleObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['style'],
    });
    
    styleObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style'],
    });

    // Also periodically check and restore styles
    const styleCheckInterval = setInterval(() => {
      // Restore body styles if changed
      if (document.body.style.margin !== originalBodyStyle.margin) {
        document.body.style.margin = originalBodyStyle.margin || '';
      }
      if (document.body.style.padding !== originalBodyStyle.padding) {
        document.body.style.padding = originalBodyStyle.padding || '';
      }
      if (document.body.style.overflow !== originalBodyStyle.overflow) {
        document.body.style.overflow = originalBodyStyle.overflow || '';
      }
      if (document.body.style.position !== originalBodyStyle.position) {
        document.body.style.position = originalBodyStyle.position || '';
      }
      
      // Restore html styles if changed
      if (document.documentElement.style.margin !== originalHtmlStyle.margin) {
        document.documentElement.style.margin = originalHtmlStyle.margin || '';
      }
      if (document.documentElement.style.padding !== originalHtmlStyle.padding) {
        document.documentElement.style.padding = originalHtmlStyle.padding || '';
      }
      if (document.documentElement.style.overflow !== originalHtmlStyle.overflow) {
        document.documentElement.style.overflow = originalHtmlStyle.overflow || '';
      }
    }, 500);

    return () => {
      styleObserver.disconnect();
      clearInterval(styleCheckInterval);
      
      // Restore original styles on cleanup
      document.body.style.margin = originalBodyStyle.margin || '';
      document.body.style.padding = originalBodyStyle.padding || '';
      document.body.style.overflow = originalBodyStyle.overflow || '';
      document.body.style.position = originalBodyStyle.position || '';
      
      document.documentElement.style.margin = originalHtmlStyle.margin || '';
      document.documentElement.style.padding = originalHtmlStyle.padding || '';
      document.documentElement.style.overflow = originalHtmlStyle.overflow || '';
    };
  }, []);

  // Step 5: Listen for postMessage events
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Messages from Fawaterak plugin (iframe)
      if (event.origin.includes("fawaterk.com")) {
        if (event.data?.invoice_key) {
          console.log("[FAWATERAK] Invoice key received:", event.data.invoice_key);
        }
        if (event.data?.error) {
          setError(event.data.message || "حدث خطأ أثناء عملية الدفع");
        }
      }

      // Messages from payment status pages
      if (event.data?.type === "FAWATERAK_PAYMENT_SUCCESS") {
        toast.success("تم إتمام عملية الدفع بنجاح");
        // Refresh page to show updated balance
        window.location.href = `/dashboard/balance?payment=${event.data.paymentId || paymentId}&status=success`;
      } else if (event.data?.type === "FAWATERAK_PAYMENT_FAILED") {
        toast.error("فشلت عملية الدفع");
        // Refresh page
        window.location.href = `/dashboard/balance?payment=${event.data.paymentId || paymentId}&status=failed`;
      } else if (event.data?.type === "FAWATERAK_PAYMENT_PENDING") {
        toast.info("في انتظار تأكيد الدفع");
        // Refresh page
        window.location.href = `/dashboard/balance?payment=${event.data.paymentId || paymentId}&status=pending`;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [router, paymentId]);

  // Step 2: Initialize plugin after scripts load and fetch interception is ready
  useEffect(() => {
    if (!scriptsReady || !amount || !paymentId || !session?.user || pluginInitialized.current) {
      return;
    }

    // Small delay to ensure fetch interception is fully set up
    const timer = setTimeout(() => {
      initializePlugin();
    }, 200);

    return () => clearTimeout(timer);
  }, [scriptsReady, amount, paymentId, session]);

  // Auto-refresh when leaving the page (back button, navigation, etc.)
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Store flag to refresh on next load
      if (window.location.pathname.includes('/payment-plugin')) {
        sessionStorage.setItem('refreshBalance', 'true');
      }
    };

    const handlePopState = () => {
      // Refresh when browser back button is used
      if (window.location.pathname.includes('/payment-plugin')) {
        window.location.href = '/dashboard/balance';
      }
    };


    // Intercept sidebar and logo navigation clicks
    const handleNavigationClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Check if click is on sidebar item or logo
      const isSidebarClick = target.closest('[data-navigation="true"]') !== null;
      const isLogoClick = target.closest('img[alt="logo"]') !== null || 
                          target.closest('a[href*="/dashboard"]') !== null;
      
      if ((isSidebarClick || isLogoClick) && window.location.pathname.includes('/payment-plugin')) {
        // Prevent default navigation
        e.preventDefault();
        e.stopPropagation();
        
        // Get the href from the clicked element
        let href = '/dashboard/balance'; // Default
        
        if (isSidebarClick) {
          const sidebarItem = target.closest('[data-navigation="true"]') as HTMLElement;
          // Try to find href from button's onClick handler or data attribute
          const button = sidebarItem as HTMLButtonElement;
          // The href is passed to router.push in the onClick handler
          // We'll intercept it at the router level instead
        }
        
        // Refresh to balance page
        window.location.href = '/dashboard/balance';
        return false;
      }
    };

    // Intercept Next.js router navigation
    const interceptRouter = () => {
      // Override router.push and router.replace when on payment plugin page
      if (window.location.pathname.includes('/payment-plugin')) {
        const originalPush = router.push;
        const originalReplace = router.replace;
        
        router.push = ((href: string, options?: any) => {
          // If navigating away from payment plugin, refresh instead
          if (!href.includes('/payment-plugin') && href !== window.location.pathname) {
            window.location.href = href.includes('/dashboard/balance') ? href : '/dashboard/balance';
            return Promise.resolve(true);
          }
          return originalPush.call(router, href, options);
        }) as any;
        
        router.replace = ((href: string, options?: any) => {
          // If navigating away from payment plugin, refresh instead
          if (!href.includes('/payment-plugin') && href !== window.location.pathname) {
            window.location.href = href.includes('/dashboard/balance') ? href : '/dashboard/balance';
            return Promise.resolve(true);
          }
          return originalReplace.call(router, href, options);
        }) as any;
        
        return () => {
          router.push = originalPush;
          router.replace = originalReplace;
        };
      }
      return () => {};
    };

    const cleanupRouter = interceptRouter();

    // Listen for page unload
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Listen for browser back/forward buttons
    window.addEventListener('popstate', handlePopState);
    
    // Listen for navigation clicks (sidebar, logo, etc.)
    document.addEventListener('click', handleNavigationClick, true); // Use capture phase

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('click', handleNavigationClick, true);
      cleanupRouter();
    };
  }, [router]);

  // Monitor pathname changes and refresh if leaving payment plugin page
  const wasOnPaymentPage = useRef(false);
  useEffect(() => {
    const isOnPaymentPage = pathname?.includes('/payment-plugin') || false;
    
    // If we were on payment page and now we're not, refresh
    if (wasOnPaymentPage.current && !isOnPaymentPage) {
      // We've navigated away from payment plugin page, refresh to ensure balance is updated
      if (pathname?.includes('/dashboard/balance')) {
        window.location.href = pathname;
      }
    }
    
    // Update ref
    wasOnPaymentPage.current = isOnPaymentPage;
  }, [pathname]);

  const initializePlugin = async () => {
    if (pluginInitialized.current) return;

    try {
      pluginInitialized.current = true;
      setIsInitializing(true);
      setError(null);

      const user = session?.user;
      if (!user) {
        throw new Error("المستخدم غير مسجل الدخول");
      }

      // Fetch hash key
      const hashResponse = await fetch("/api/payment/fawaterak/hash", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!hashResponse.ok) {
        throw new Error("فشل في الحصول على مفتاح التشفير");
      }

      const { hashKey } = await hashResponse.json();

      // Get user data
      const firstName = user.fullName?.split(" ")[0] || "User";
      const lastName = user.fullName?.split(" ").slice(1).join(" ") || "";
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;

      // Ensure container exists
      const container = document.getElementById("fawaterkDivId");
      if (!container) {
        throw new Error("عنصر الحاوية غير متاح");
      }

      // Configure plugin
      const pluginConfig: any = {
        envType: "test", // "test" for staging, "live" for production
        hashKey: hashKey, // Generated from domain + provider key
        style: {
          listing: "horizontal", // Payment methods layout
        },
        requestBody: {
          cartTotal: amount,
          currency: "EGP",
          redirectOutIframe: true, // Important: redirects to top window
          customer: {
            customer_unique_id: user.id,
            first_name: firstName,
            last_name: lastName,
            email: user.email || `${user.id}@example.com`,
            phone: user.phoneNumber || "",
          },
          redirectionUrls: {
            successUrl: `${baseUrl}/payment/success?payment=${paymentId}`,
            failUrl: `${baseUrl}/payment/fail?payment=${paymentId}`,
            pendingUrl: `${baseUrl}/payment/pending?payment=${paymentId}`,
          },
          webhookUrl: `${baseUrl}/api/payment/fawaterak/webhook/paid`,
          cartItems: [
            {
              name: "إضافة رصيد",
              price: amount,
              quantity: "1",
            },
          ],
          deduct_total_amount: 1,
          payLoad: {
            paymentId: paymentId,
            userId: user.id,
            timestamp: new Date().toISOString(),
          },
        },
      };

      console.log("[FAWATERAK] Initializing plugin with config:", pluginConfig);

      // Store config globally with the exact name the plugin expects
      // The plugin's getEnvUrl function looks for 'pluginConfig' variable
      (window as any).pluginConfig = pluginConfig;
      (window as any).__fawaterkConfig = pluginConfig;

      // Wait for plugin function to be available and DOM to be ready
      let attempts = 0;
      const maxAttempts = 50;
      while ((!window.fawaterkCheckout || !document.getElementById("fawaterkDivId")) && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      // Ensure container still exists
      if (!document.getElementById("fawaterkDivId")) {
        throw new Error("عنصر الحاوية غير متاح بعد التحميل");
      }

      // The plugin's getEnvUrl function is looking for 'pluginConfig' variable
      // This appears to be a bug in the plugin - it's trying to access pluginConfig
      // as a variable instead of using the parameter. We'll work around this by
      // creating a scope where pluginConfig is available as a variable.
      try {
        // Create a function scope where pluginConfig is available as a variable
        const initPlugin = new Function('pluginConfig', `
          // Make pluginConfig available in global scope for the plugin to access
          window.pluginConfig = pluginConfig;
          
          // Now call the plugin function
          if (window.jQuery && window.jQuery.fn && window.jQuery.fn.fawaterk) {
            return window.jQuery("#fawaterkDivId").fawaterk(pluginConfig);
          } else if (window.fawaterkCheckout) {
            return window.fawaterkCheckout(pluginConfig);
          } else if (window.fawaterk && window.fawaterk.checkout) {
            return window.fawaterk.checkout(pluginConfig);
          } else {
            throw new Error("دالة Fawaterak غير متاحة");
          }
        `);
        
        console.log("[FAWATERAK] Calling plugin with Function constructor");
        const result = initPlugin(pluginConfig);
        
        // If it returns a promise, wait for it
        if (result && typeof result.then === 'function') {
          await result;
        }
      } catch (err: any) {
        console.error("[FAWATERAK] Error with Function constructor approach:", err);
        
        // Fallback: Try setting it globally and calling directly
        try {
          (window as any).pluginConfig = pluginConfig;
          
          if (window.jQuery && window.jQuery.fn && window.jQuery.fn.fawaterk) {
            console.log("[FAWATERAK] Fallback: Using jQuery plugin method");
            const result = window.jQuery("#fawaterkDivId").fawaterk(pluginConfig);
            if (result && typeof result.then === 'function') {
              await result;
            }
          } else if (window.fawaterkCheckout) {
            console.log("[FAWATERAK] Fallback: Using fawaterkCheckout function");
            const result = window.fawaterkCheckout(pluginConfig);
            if (result && typeof result.then === 'function') {
              await result;
            }
          } else {
            throw new Error("دالة Fawaterak غير متاحة. يرجى التحقق من تحميل المكون بشكل صحيح.");
          }
        } catch (fallbackErr: any) {
          console.error("[FAWATERAK] Fallback also failed:", fallbackErr);
          delete (window as any).pluginConfig;
          throw fallbackErr;
        }
      }

      console.log("[FAWATERAK] Plugin initialized successfully");
      
      // Clear any React-managed children from the container after plugin initializes
      // This prevents React reconciliation conflicts
      if (containerRef.current) {
        // The plugin now manages the container's children
        // React should not try to reconcile them
        const container = containerRef.current;
        // Remove any React-managed children that might interfere
        const reactChildren = Array.from(container.children).filter(
          (child) => !child.id || !child.id.includes('fawaterk')
        );
        reactChildren.forEach((child) => {
          try {
            container.removeChild(child);
          } catch (e) {
            // Ignore errors - child might already be removed by plugin
          }
        });
        
        // Apply dark background styling to container and any injected elements
        container.style.backgroundColor = 'hsl(var(--background))';
        container.style.color = 'hsl(var(--foreground))';
        
        // Isolate container to prevent iframe from affecting page layout
        container.style.isolation = 'isolate';
        container.style.contain = 'layout style paint';
        container.style.position = 'relative';
        container.style.zIndex = '0';
        container.style.overflow = 'hidden';
        container.style.transform = 'translateZ(0)'; // Create new stacking context
        container.style.willChange = 'contents';
        
        // Apply dark background to any iframes or divs injected by the plugin
        setTimeout(() => {
          const isLightColor = (color: string): boolean => {
            if (!color || color === 'transparent') return false;
            const lightColors = ['white', '#ffffff', '#fff', 'rgb(255, 255, 255)', '#f9fafb', '#f3f4f6', '#e5e7eb'];
            return lightColors.some(light => color.toLowerCase().includes(light));
          };

          const iframes = container.querySelectorAll('iframe');
          iframes.forEach((iframe) => {
            iframe.style.backgroundColor = 'transparent';
            // Isolate iframe completely to prevent it from affecting page
            iframe.style.isolation = 'isolate';
            iframe.style.contain = 'layout style paint';
            iframe.style.position = 'relative';
            iframe.style.zIndex = '0';
            iframe.style.transform = 'translateZ(0)'; // Create new stacking context
            iframe.style.willChange = 'contents';
            iframe.style.overflow = 'hidden';
          });
          
          // Style all elements with light colors
          const allElements = container.querySelectorAll('*');
          allElements.forEach((el) => {
            const htmlEl = el as HTMLElement;
            const computedStyle = window.getComputedStyle(htmlEl);
            
            // Replace light backgrounds
            if (isLightColor(computedStyle.backgroundColor)) {
              htmlEl.style.backgroundColor = 'hsl(var(--background))';
            }
            
            // Replace light text
            if (isLightColor(computedStyle.color)) {
              htmlEl.style.color = 'hsl(var(--foreground))';
            }
            
            // Replace light borders
            if (isLightColor(computedStyle.borderColor)) {
              htmlEl.style.borderColor = 'hsl(var(--border))';
            }
          });
        }, 500);
      }
    } catch (err: any) {
      console.error("[FAWATERAK] Plugin initialization error:", err);
      setError(err.message || "حدث خطأ أثناء تحميل صفحة الدفع");
      pluginInitialized.current = false;
      
      if (err?.message?.includes("Invalid Token")) {
        setError(`خطأ في التكوين: ${err.message}`);
      }
    } finally {
      setIsInitializing(false);
    }
  };

  if (!amount || !paymentId || !session?.user) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-red-600">معلومات الدفع غير صحيحة</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-background min-h-screen">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={() => {
            // Refresh the page when returning
            window.location.href = "/dashboard/balance";
          }}
        >
          <ArrowLeft className="h-4 w-4 rtl:ml-2 ltr:mr-2" />
          العودة
        </Button>
        <div>
          <h1 className="text-2xl font-bold">إضافة رصيد</h1>
          <p className="text-muted-foreground">
            اختر طريقة الدفع المناسبة لك
          </p>
        </div>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="bg-card">
          <CardTitle className="text-card-foreground">المبلغ: {amount} جنيه</CardTitle>
        </CardHeader>
        <CardContent className="bg-card">
          {/* Step 3: Iframe container - Plugin injects UI here */}
          <div 
            className="min-h-[600px] w-full relative bg-background rounded-lg border border-border"
            style={{
              isolation: 'isolate',
              contain: 'layout style paint',
              position: 'relative',
              zIndex: 0,
              overflow: 'hidden',
              transform: 'translateZ(0)', // Create new stacking context
              willChange: 'contents',
            }}
          >
            {/* Container for plugin - React should not manage its children */}
            <div
              id="fawaterkDivId"
              className="min-h-[600px] w-full bg-background rounded-lg"
              style={{
                backgroundColor: 'hsl(var(--background))',
                color: 'hsl(var(--foreground))',
                isolation: 'isolate',
                contain: 'layout style paint',
                position: 'relative',
                zIndex: 0,
                overflow: 'hidden',
                transform: 'translateZ(0)', // Create new stacking context
                willChange: 'contents',
              }}
              ref={(el) => {
                containerRef.current = el;
                if (el) {
                  // Apply dark theme immediately
                  el.style.backgroundColor = 'hsl(var(--background))';
                  el.style.color = 'hsl(var(--foreground))';
                  
                  const isLightColor = (color: string): boolean => {
                    if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return false;
                    const lightColors = ['white', '#ffffff', '#fff', 'rgb(255, 255, 255)', '#f9fafb', '#f3f4f6', '#e5e7eb', '#d1d5db'];
                    return lightColors.some(light => color.toLowerCase().includes(light));
                  };
                  
                  const applyDarkTheme = (element: HTMLElement) => {
                    const computedStyle = window.getComputedStyle(element);
                    
                    // Replace light backgrounds
                    if (isLightColor(computedStyle.backgroundColor)) {
                      element.style.backgroundColor = 'hsl(var(--background))';
                    }
                    
                    // Replace light text (but preserve brand colors)
                    if (isLightColor(computedStyle.color) && !element.classList.toString().includes('brand')) {
                      element.style.color = 'hsl(var(--foreground))';
                    }
                    
                    // Replace light borders
                    if (isLightColor(computedStyle.borderColor)) {
                      element.style.borderColor = 'hsl(var(--border))';
                    }
                  };
                  
                  // Use MutationObserver to detect when elements are added
                  const observer = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                      mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) {
                          const element = node as HTMLElement;
                          applyDarkTheme(element);
                          
                          // Apply to all children
                          const allChildren = element.querySelectorAll('*');
                          allChildren.forEach((child) => applyDarkTheme(child as HTMLElement));
                          
                          // Find iframe elements
                          const iframes = element.querySelectorAll?.('iframe') || [];
                          iframes.forEach((iframe: HTMLIFrameElement) => {
                            iframe.style.backgroundColor = 'transparent';
                          });
                          
                          // If the node itself is an iframe
                          if (element.tagName === 'IFRAME') {
                            (element as HTMLIFrameElement).style.backgroundColor = 'transparent';
                          }
                        }
                      });
                    });
                  });
                  observer.observe(el, { childList: true, subtree: true, attributes: true });
                }
              }}
              suppressHydrationWarning
            />
            
            {/* Overlay states - rendered as siblings to avoid React reconciliation conflicts */}
            {isLoading || isInitializing ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center py-12 bg-background/80 backdrop-blur-sm z-10 pointer-events-none">
                <div className="bg-background/90 rounded-lg p-6 pointer-events-auto">
                  <Loader2 className="h-8 w-8 animate-spin text-brand mb-4 mx-auto" />
                  <p className="text-muted-foreground text-center">
                    {isLoading 
                      ? "جاري تحميل المكونات..." 
                      : isInitializing 
                      ? "جاري تحميل صفحة الدفع..." 
                      : "جاري التحميل..."}
                  </p>
                </div>
              </div>
            ) : null}
            
            {error ? (
              <div className="absolute inset-0 flex items-center justify-center py-12 bg-background/80 backdrop-blur-sm z-10 pointer-events-none">
                <div className="bg-background rounded-lg p-6 max-w-md w-full mx-4 pointer-events-auto">
                  <div className="text-center space-y-4">
                    <p className="text-red-600 mb-4">{error}</p>
                    <div className="text-sm text-muted-foreground space-y-2">
                      <p>إذا استمرت المشكلة، يرجى:</p>
                      <ul className="list-disc list-inside space-y-1 text-right">
                        <li>التحقق من الاتصال بالإنترنت</li>
                        <li>التحقق من إعدادات Fawaterak في لوحة التحكم</li>
                        <li>إضافة رابط المكون الصحيح في ملف .env</li>
                      </ul>
                    </div>
                    <Button 
                      onClick={() => {
                        pluginInitialized.current = false;
                        scriptLoaded.current = false;
                        setError(null);
                        setIsLoading(true);
                        // Reload page to restart script loading
                        window.location.reload();
                      }}
                      className="mt-4"
                    >
                      إعادة المحاولة
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PaymentPluginPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-brand mb-4" />
                <p className="text-muted-foreground">جاري التحميل...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
      <PaymentPluginContent />
    </Suspense>
  );
}
