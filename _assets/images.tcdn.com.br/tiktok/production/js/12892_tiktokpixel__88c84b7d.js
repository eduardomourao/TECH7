
	
		!function (w, d, t) {
		  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++
)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{},ttq._partner=ttq._partner||'Tray';
var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
		
		  ttq.load('CR1L7U3C77U4OTFNTKQG');
		  ttq.page();
		}(window, document, 'ttq');
	
	/**
 * Pixel
 *
 * @var string
 */
const PIXEL = 'CR1L7U3C77U4OTFNTKQG'


/**
 * @param {"SHA-1"|"SHA-256"|"SHA-384"|"SHA-512"} algorithm https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
 * @param {string|Blob} data
 */
async function getHash(algorithm, data) {

    const main = async (msgUint8) => { // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest#converting_a_digest_to_a_hex_string
        const hashBuffer = await crypto.subtle.digest(algorithm, msgUint8)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join(''); // convert bytes to hex string
    }

    if (data instanceof Blob) {
        const arrayBuffer = await data.arrayBuffer()
        const msgUint8 = new Uint8Array(arrayBuffer)
        return await main(msgUint8)
    }
    const encoder = new TextEncoder()
    const msgUint8 = encoder.encode(data)
    return await main(msgUint8)
}

/**
 * Atualiza o cookie TTCLID sempre que ele for passado na URL
 *
 * @return {void}
 */
const setTtclidLocalstorage = () => {

    const urlSearchParams = new URLSearchParams(window.location.search);
    const ttclidValue = urlSearchParams.get('ttclid')
    const currentDate= new Date()
    currentDate.setDate(currentDate.getDate() + 28)

    const expirationDate = currentDate.toISOString()

    let data = {
        value: ttclidValue,
        expirationDate: expirationDate
    }

    if (ttclidValue) {
        window.localStorage.setItem('ttclid', JSON.stringify(data))
    }
}

/**
 * Formata o preço
 *
 * @return Number
 */
function formatPrice(value) {

    if (isNaN(value) || value.length <= 0) {
        return 0.00;
    }

    if(typeof value === "string"){
        value = parseFloat(value);
    }

    return parseFloat(value.toFixed(2));
}

/**
 * Manual advanced matching
 *
 * @var boolean
 */
const MANUAL_ADVANCED_MATCHING = (/1/).test('1')

/**
 * Cria um id para os eventos de pixel
 * @returns string
 */
let randomCode = () => {
    return `${PIXEL}${Date.now().toString()}`;
};

/**
 * Define se os dados do usuário estão mascarados
 *
 * @var {boolean} isCustomerInfoMasked
 */
let isCustomerInfoMasked = false;

/**
 * Identificador de usuário para eventos
 *
 * @param {object} data
 * @returns TikTok Instance
 */
const ttIdentify = (data) => {
    return ttq.identify({
        email: data.customer.email,
        phone_number: `${data.customer.phone_number}`,
        external_id: data.customer.external_id,
    });
};

/**
 * Pega o TTCLID via cookie
 *
 * @return {string}
 */
const getTikTokCookie = (cookieKey) => {
    let cookie = {};
    document.cookie.split(';').forEach(function(el) {
        let [k,v] = el.split('=');
        cookie[k.trim()] = v;
    })
    return cookie[cookieKey];
}

/**=
 * Retorna o ttclid
 * @return {any}
 */
const getTtclidFromLocalstorage = () => {
    const ttclid = JSON.parse(window.localStorage.getItem('ttclid'))
    console.log('getTtclidFromLocalstorage', ttclid ? ttclid.value : null)
    return ttclid ? ttclid.value : null
}

/**
 * Retorna os dados
 *
 * @param event
 * @param user
 * @param value
 * @param contents
 * @return object
 */
const getDataRaw = async (event, user, value, contents) => {
    const dataRaw = {
        event_source: "web",
        event_source_id: PIXEL,
        partner_name: "Tray",
        data: [
            {
                event: event,
                event_time: Date.now(),
                event_id:  await getHash('SHA-256', `${event}-${randomCode()}`),
                tray_store_id: getStoreId(),
                page: {
                    url: window.location.href,
                    referrer: window.location.origin,
                },
                properties: {
                    currency: 'BRL',
                    partner_name: 'Tray'
                }
            }
        ]
    };
    
    if(value) {
        console.log('TIKTOK:: value tem valor')
        dataRaw.data[0].properties.value = value
    }

    if(contents) {
        console.log('TIKTOK:: contents tem dados')
        dataRaw.data[0].properties.contents = contents
    }

    if(MANUAL_ADVANCED_MATCHING) {
        dataRaw.data[0].user = user
    }

    return dataRaw
};

/**
 * Verifica se está em uma página específica
 * @param {string} pageTitle
 * @returns boolean
 */
const checkIfIsOnThePage = (pageTitle) => {
    let isOnThePage = false;
    const { page$ } = window.tray.store.observers;
    page$.subscribe((page) => {
        if(page) {
            if(window.tray.store.state.page.type === pageTitle) {
                isOnThePage = true;
            }
        }
    });

    return isOnThePage;
}

const getAuxUserData = async () => {
    const ttpCookieData = getTikTokCookie('_ttp')
    const tiktokClickId = getTtclidFromLocalstorage('ttclid')

    if(tiktokClickId && tiktokClickId.length > 0) {
        console.log("Has TTCLID: ", tiktokClickId);
        return {
            ttp: ttpCookieData,
            ttclid: tiktokClickId,
            external_id: await getHash("SHA-256", `${getStoreId()}${Date.now().toString()}`),
            user_agent: navigator.userAgent
        }
    }

    return {
        ttp: ttpCookieData,
        external_id: await getHash("SHA-256", `${getStoreId()}${Date.now().toString()}`),
        user_agent: navigator.userAgent
    }
}

/**
 * Pega os dados do usuário pelo objeto dataLayer
 *
 * @returns object
 */
const getCustomerInfoFromDataLayer = async () => {
    const userAuxData = await getAuxUserData()

    let customerIfoFromDataLayer = {
        name: "Visitor",
        email: "",
        phone_number: "",
        ...userAuxData
    };

    let hasInfoDataLayer = false
    for (const item of dataLayer) {

        if(item.customerEmail) {
            customerIfoFromDataLayer.name = item.customerName;
            customerIfoFromDataLayer.email = await getHash("SHA-256", item.customerEmail);
            hasInfoDataLayer = true
        }
    }

    if(customerIfoFromDataLayer.email && customerIfoFromDataLayer.email.includes('***')) {
        isCustomerInfoMasked = true;
    }

    return {
        customerIfoFromDataLayer,
        hasInfoDataLayer
    };
}

/**
 * Pega os dados do usuário pelo objeto globalCart
 *
 * @returns object
 */
const getCustomerInfoFromGlobalCart = async () => {
    const userAuxData = await getAuxUserData()

    let customerIfoFromGlobalCart = {name: "Visitor",
        email: "",
        phone_number: "",
        ...userAuxData
    };

    let hasInfoGlobalCart = false

    const customer = globalCart.data.cart.customer;

    if(!customer || !customer.email) {
        return {
            customerIfoFromGlobalCart,
            hasInfoGlobalCart
        }
    }

    const cellPhoneHashed = await getHash("SHA-256", `+55${customer.cellphone}`)

    customerIfoFromGlobalCart.name = customer.name
    customerIfoFromGlobalCart.email = await getHash("SHA-256", customer.email);
    customerIfoFromGlobalCart.phone_number = customer.cellphone ? cellPhoneHashed : ""

    hasInfoGlobalCart = true

    if(customerIfoFromGlobalCart.email && customerIfoFromGlobalCart.email.includes('***')) {
        isCustomerInfoMasked = true;
    }

    return {
        customerIfoFromGlobalCart,
        hasInfoGlobalCart
    };
}

/**
 * Retorna o ID da Loja Tray
 * @returns string
 */
const getStoreId = () => {
    let id = null;

    document.cookie.split(";").forEach(item => {
        const [key, value] = item.split("=");

        if(key.trim() === 'LOJA') {
            id = value;
        }
    });

    return id;
}


/**
 * Data for API Events and Pixel Events
 * @returns object
 */
const getInfo = async () => {
    if(!checkIfIsOnThePage('Carrinho') && !checkIfIsOnThePage('EasyCheckout_Identification')) {
        console.log('TIKTOK :: Data from dataLayer')
        const getCustomerInfo = await getCustomerInfoFromDataLayer();

        return {
            customer: getCustomerInfo.customerIfoFromDataLayer,
            storeId: getStoreId(),
            hasDataToSend: getCustomerInfo.hasInfoDataLayer
        };
    }

    console.log('TIKTOK :: Data from globalCart')
    const getCustomerInfo = await getCustomerInfoFromGlobalCart()

    return {
        customer: getCustomerInfo.customerIfoFromGlobalCart,
        storeId: getStoreId(),
        hasDataToSend: getCustomerInfo.hasInfoGlobalCart
    };
};

/**
 * Cria uma instância para executar um evento
 *
 * @param {object} dataRaw
 * @returns TikTok Instance
 */
const firePixel = (dataRaw) => {
    if(isCustomerInfoMasked) {
        console.log(`TIKTOK :: PIXEL event not fired: ${dataRaw.data[0].event}`);
        return
    }

    console.log(`TIKTOK :: Fired PIXEL event: ${dataRaw.data[0].event}`);
    return ttq.instance(PIXEL)
            .track(
                dataRaw.data[0].event,
                dataRaw.data[0].properties,
                {
                    event_id: dataRaw.data[0].event_id,
                },
            );
};

/**
 * Salva  Event API
 *
 * @param dataRaw
 * @returns void
 */
const saveEventAPI = (dataRaw) => {
    const url = 'https://tiktok.tray.com.br/tiktok/api/events/save-event';

    console.log(`TIKTOK :: Save Event API: ${dataRaw.data[0].event}`);
    fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(dataRaw)
    })
        .then((response) => response.json())
        .then((response) => {
            console.log('TIKTOK :: Save Event API: Data was sent successfully');
        })
        .catch((error) => {
            console.log('Error: ', error);
        });
};

/**
 * Dispara os eventos do carrinho
 *
 * @returns void
 */
const inscriptionCart = () => {
    const { cart$ } = window.tray.store.observers;

    cart$.subscribe(async (cart) => {
        if(cart) {
            const { products } = globalCart.data.cart
            let contents = [];
            let cartValue = 0;
            const eventInfo = await getInfo();

            if(products.length > 0) {
                products.forEach((product) => {
                    const productPrice = formatPrice(product.price)
                    const contentId = product.id.toString();
                    contents.push({
                        content_id: contentId,
                        content_type: 'product',
                        content_name: product.name,
                        quantity: product.quantity,
                        price: productPrice,
                        brand: product.brand
                    });
                    const totalProductPrice = product.quantity * productPrice

                    cartValue += totalProductPrice;
                    cartValue = formatPrice(cartValue);
                })
            }
        
            let dataRaw = await getDataRaw('AddToCart', eventInfo.customer, cartValue, contents);
        
            ttIdentify(eventInfo);
            firePixel(dataRaw);
            saveEventAPI(dataRaw);
        
            if(checkIfIsOnThePage('Carrinho')) {
                setTimeout(async () => {
                    dataRaw = await getDataRaw('InitiateCheckout', eventInfo.customer, cartValue, contents);

                    firePixel(dataRaw);
                    saveEventAPI(dataRaw)
                }, 2000)
                dataLayer.push({'pageCategory': 'Carrinho'});
            }

            const pageViewEvent = await getDataRaw('Pageview', eventInfo.customer, null, null);
            firePixel(pageViewEvent);
            saveEventAPI(pageViewEvent);
        }
    })
}

/**
 * Eventos baseados em visualizações de conteúdo de produtos
 * @returns void
 */
const inscriptionProduction = () => {
    const { product$ } = window.tray.store.observers;

    product$.subscribe(async (product) => {
        if(product) {
            const eventInfo = await getInfo();
            const productPrice = formatPrice(product.selling_price);
            const contentId = product.id.toString();
            const contents = [{
                content_id: contentId,
                content_type: 'product',
                content_name: product.name,
                quantity: '1',
                price: productPrice,
                brand: product.brand
            }]
            ttIdentify(eventInfo);

            const dataRaw = await getDataRaw('ViewContent', eventInfo.customer,  productPrice, contents);
            firePixel(dataRaw);
            saveEventAPI(dataRaw);

            const pageViewEvent = await getDataRaw('Pageview', eventInfo.customer, null, null);
            firePixel(pageViewEvent);
            saveEventAPI(pageViewEvent);
        }
    });
}

/**
 * Eventos baseados na finalização da compra
 * @returns void
 */
const inscriptionCheckout = () => {
    const { checkout$ } = window.tray.store.observers;

    checkout$.subscribe(async (checkout) => {
        if(checkout) {
            if(window.tray.store.state.checkout.step.name === 'purchase completed') {
                let items = checkout.step.details.items;
                let contents = [];
                const eventInfo = await getInfo();

                items.forEach(function(item, i) {
                    const productPrice = formatPrice(item.product.price);
                    const contentId = item.product.id.toString();
                    contents.push({
                        content_id: contentId,
                        content_type: 'product',
                        content_name: item.product.name,
                        quantity: item.quantity,
                        price: productPrice,
                        brand: item.product.brand
                    });
                });

                ttIdentify(eventInfo);

                const dataRawPlaceAnOrder = await getDataRaw('PlaceAnOrder', eventInfo.customer,  checkout.step.details.revenue, contents);
                firePixel(dataRawPlaceAnOrder);
                saveEventAPI(dataRawPlaceAnOrder)

                const dataRawCompletePayment = await getDataRaw('CompletePayment', eventInfo.customer,  checkout.step.details.revenue, contents);
                firePixel(dataRawCompletePayment);
                saveEventAPI(dataRawCompletePayment)

                const pageViewEvent = await getDataRaw('Pageview', eventInfo.customer,  null, null);
                firePixel(pageViewEvent);
                saveEventAPI(pageViewEvent);

                dataLayer.push({'pageCategory': 'EasyCheckout_OrderPlaced'});
            }
        }
    });
}


(function() {

    window.addEventListener("load", async function() {
        await setTtclidLocalstorage()

        setTimeout(async () => {
            if(checkIfIsOnThePage('home')) {
                console.log('TIKTOK :: Event fired on HOME page. ');
                const eventInfo = await getInfo();
                
                ttIdentify(eventInfo);
                const pageViewEvent = await getDataRaw('Pageview', eventInfo.customer,  null, null);
                firePixel(pageViewEvent);
                saveEventAPI(pageViewEvent);
            }

            if(checkIfIsOnThePage('Newsletter') || checkIfIsOnThePage('newsletter')) {
                console.log('TIKTOK :: Event fired on Newsletter page. ');
                const eventInfo = await getInfo();

                ttIdentify(eventInfo);

                const subscribeEvent = await getDataRaw('Subscribe', eventInfo.customer,  null, null);
                firePixel(subscribeEvent);
                saveEventAPI(subscribeEvent);


                const pageViewEvent = await getDataRaw('Pageview', eventInfo.customer,  null, null);
                firePixel(pageViewEvent);
                saveEventAPI(pageViewEvent);
            }

            if(checkIfIsOnThePage('search')) {
                console.log('TIKTOK :: Event fired on SEARCH page. ')
                const eventInfo = await getInfo();

                const queryParam = location.search.split("&")
                    .filter((item) => item.includes("palavra_busca"))
                    .toLocaleString()
                    .split("=")[1]

                const contents = [
                    {
                        content_name: window.tray.store.state.page.title,
                        query: queryParam
                    }
                ]
                ttIdentify(eventInfo);

                const searchEvent = await getDataRaw('Search', eventInfo.customer,  null, contents);
                firePixel(searchEvent);
                saveEventAPI(searchEvent);

                const pageViewEvent = await getDataRaw('Pageview', eventInfo.customer,  null, null);
                firePixel(pageViewEvent);
                saveEventAPI(pageViewEvent);
            }

            if(checkIfIsOnThePage('catalog')) {
                console.log('TIKTOK :: Event fired on CATALOG page. ');
                const eventInfo = await getInfo();

                ttIdentify(eventInfo);
                const pageViewEvent = await getDataRaw('Pageview', eventInfo.customer,  null, null);
                firePixel(pageViewEvent);
                saveEventAPI(pageViewEvent);
            }

            inscriptionCart()
            inscriptionProduction()
            inscriptionCheckout()
        }, 3000)

    }, false);
})();
