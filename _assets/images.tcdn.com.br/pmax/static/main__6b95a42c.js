// gtag script
const script = document.createElement("script");
script.type = "text/javascript";
script.src = "https://www.googletagmanager.com/gtag/js";
script.async = !0;
document.head.appendChild(script);

// SSC events
(function () {
    const getCode = field => {
        let scripts = document.getElementsByTagName("script"),
            pattern = "(" + field + "=)([a-zA-Z0-9-_, ]{0,})";

        for (let i in scripts) {
            if (/pmax\/static\/main.js/.test(scripts[i].src)) {
                let values = scripts[i].src.match(new RegExp(pattern));

                if (values != null) {
                    return values[2];
                }
            }
        }
    };

    const GTM_get = (key = null) => {
        return dataLayer.map(elem => elem[key]).filter(valor => { valor != "undefined"; return valor; }).pop();
    };

    const getPageCategory = () => String(GTM_get('pageCategory') || "");
    const getPageCategoryLower = () => getPageCategory().toLowerCase();

    const mapCartProducts = (cartProducts) => {
        if (!cartProducts || cartProducts.length < 1) return [];

        return cartProducts.map(cartProduct => {
            return {
                brand: cartProduct.brand,
                category: cartProduct.category,
                google_business_vertical: 'retail',
                id: cartProduct.id,
                name: cartProduct.name,
                price: parseFloat(cartProduct.sellPrice ? cartProduct.sellPrice : cartProduct.price),
            }
        })
    }

    const getCartTotalValue = (cartProducts) => {
        if (!cartProducts || cartProducts.length < 1) return 0;

        return cartProducts.reduce((totalValue, cartProduct) => {
            return totalValue + parseFloat(cartProduct.sellPrice ? cartProduct.sellPrice : cartProduct.price);
        }, 0);
    }

    setTimeout(function () {
        // Set the initial state
        let state = {
            CONVERSION_ACTION_ID: getCode("caid"),
            CONVERSION_TRACKING_ID: "AW-" + getCode("ctid"),
            DEVELOPER_ID: "dNzViMm"
        };

        console.log("[Google SSC] Initialized");
        console.log("[Google SSC] Conversion Action ID: " + state.CONVERSION_ACTION_ID);
        console.log("[Google SSC] Conversion Tracking ID: " + state.CONVERSION_TRACKING_ID);

        // gtag setup
        window.dataLayer = window.dataLayer || [];
        function gtag() { dataLayer.push(arguments); }
        gtag('js', new Date());
        gtag('config', state.CONVERSION_TRACKING_ID);
        gtag('set', 'developer_id.' + state.DEVELOPER_ID, true);

        // Set available events
        const eventTypes = {
            ADD_TO_CART: 'add_to_cart',
            PAGE_VIEW: 'page_view',
            PURCHASE: 'purchase',
            VIEW_ITEM: 'view_item'
        }

        // Set available ecommerce page types
        const ecommPageTypes = {
            CART: 'cart',
            PRODUCT: 'product',
            PURCHASE: 'purchase'
        }

        // Set the method that is going to fire the gtag events
        const gtagEvent = (eventType, data = {}) => {
            if (typeof eventType != 'undefined') {
                data['send_to'] = 
                    eventType === eventTypes.PURCHASE ? 
                    state.CONVERSION_TRACKING_ID + '/' + state.CONVERSION_ACTION_ID : 
                    state.CONVERSION_TRACKING_ID;

                gtag('event', eventType, data)
                console.log('[Google SSC] Event: ' + eventType);
                console.log('[Google SSC] Event data:', data);
            }
        }

        // Fire the default page view event
        gtagEvent(eventTypes.PAGE_VIEW)

        // Store events
        switch (getPageCategoryLower()) {
            case "produto":
                gtagEvent(eventTypes.VIEW_ITEM, {
                    ecomm_pagetype: ecommPageTypes.PRODUCT,
                    value: GTM_get('priceSell'),
                    items: [{
                        brand: GTM_get('brand'),
                        category: GTM_get('category'),
                        google_business_vertical: 'retail',
                        id: GTM_get('idProduct'),
                        name: GTM_get('nameProduct'),
                        price: GTM_get('priceSell'),
                    }]
                })
                break;

            case "carrinho":
                setTimeout(function () {
                    const cartProducts = GTM_get('ecommerce').checkout.products;

                    gtagEvent(eventTypes.PAGE_VIEW, {
                        ecomm_pagetype: ecommPageTypes.CART,
                        items: mapCartProducts(cartProducts),
                        value: getCartTotalValue(cartProducts)
                    })
                }, 2000);
                break;
        }

        // EasyCheckout events
        if ("EasyCheckout" === getPageCategory().substr(0, 12)) {
            setTimeout(function () {
                let oldPush = dataLayer.push;
                let lastPageCategory = "";

                dataLayer.push = function () {
                    var x = [].slice.call(arguments, 0);
                    var result = oldPush.apply(dataLayer, x);

                    switch (getPageCategoryLower()) {
                        case "easycheckout_orderplaced":
                            if (lastPageCategory != getPageCategoryLower()) {
                                lastPageCategory = getPageCategoryLower();
                                gtagEvent(eventTypes.PURCHASE, {
                                    country: 'BR',
                                    currency: 'BRL',
                                    ecomm_pagetype: ecommPageTypes.PURCHASE,
                                    items: mapCartProducts(GTM_get('ecommerce').purchase.products),
                                    transaction_id: GTM_get('ecommerce').purchase.actionField.id,
                                    value: Math.abs(GTM_get('ecommerce').purchase.actionField.revenue),
                                })
                            }
                            break;
                    }
                    return result;
                }
            }, 1000);
        }
    }, 1000);
})();
