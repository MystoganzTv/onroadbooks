# OnRoad Books — iOS (SwiftUI)

App nativa en Swift/SwiftUI para OnRoad Books, la "cabina financiera" para
owner-operators. Mismo lenguaje visual que la web app (colores, tipografía,
tarjetas, disciplina de color verde/rojo), traducido a componentes nativos
de iOS — y ahora conectada de verdad al mismo backend que usa la web.

## Qué incluye

- **Login** real contra `/api/mobile/login` (o "Ver con datos de muestra"
  para revisar diseño sin cuenta / sin backend desplegado todavía).
- **Dashboard** (el cockpit): booked revenue, cash collected, accounts
  receivable, operating profit, cash after debt service, cost per mile,
  safe to pay, money flow por categoría, últimos loads y reservas.
- **Loads**: lista con rating (GREAT/GOOD/MARGINAL/BAD, igual que
  `ProfitabilityRating` en el backend) y profit por milla.
- **Expenses**: lista agrupada por categoría, con la categoría real del
  backend (`getCategory().label`), no una lista fija en la app.
- **Settlements**: quincenas OPEN/CLOSED con su snapshot real.
- **Load Calculator**: "¿me conviene este load?" y "¿qué tarifa pido?",
  portado fórmula por fórmula de `src/lib/finance/load-calculator.ts`.
- **More**: pantallas funcionales para Fuel, Invoices, Reserves, IFTA,
  Analytics, Reports, Fleet, Truck, Drivers y Driver Pay. Las funciones de
  Fleet respetan el plan y los permisos del negocio; Plans & Billing explica
  que esa gestión continúa en `onroadbooks.com`.
- **Settings**: cierre de sesión real (borra el token del Keychain).

## Datos: reales, no solo demo

La app ya habla con el backend real vía `APIRepository` (`URLSession` liso,
sin SDK de terceros) contra las rutas `/api/mobile/*` que se agregaron a la
propia app Next.js — ver la sección de abajo. Al no iniciar sesión, el
botón "Ver con datos de muestra" cae a `MockRepository`, sembrado con las
cifras reales de agosto ($9,795.00 / $6,143.90 / $3,651.10 / $1.84 CPM /
$2,235.23 safe-to-pay) para que la app se vea con números creíbles incluso
sin cuenta.

Las rutas móviles ya están desplegadas en producción, por lo que el login y
los datos reales funcionan desde el iPhone. "Ver con datos de muestra" sigue
disponible como modo demo deliberado y no como sustituto temporal del backend.

## Por qué no hay un `.xcodeproj` ya generado

Este proyecto se armó desde una sesión en la nube sin Xcode disponible para
compilar o generar el `.xcodeproj` de forma binaria. En su lugar se usa
[XcodeGen](https://github.com/yonaskolb/XcodeGen), que genera el proyecto a
partir de `project.yml` — así el proyecto entero vive como texto plano y es
fácil de versionar en git junto al resto de OnRoad Books.

## Cómo abrirlo (una sola vez)

```bash
brew install xcodegen        # si no lo tienes
cd ~/Developer/OnroadBooks/mobile
xcodegen generate
open OnRoadBooksMobile.xcodeproj
```

En Xcode:
1. Selecciona el target `OnRoadBooks` → pestaña **Signing & Capabilities** →
   elige tu **Team** (tu Apple ID personal sirve para correr en simulador o
   en tu propio iPhone).
2. Elige un simulador de iPhone (16 Pro, por ejemplo) y presiona ▶️ Run.

Cada vez que se agreguen archivos `.swift` nuevos hay que volver a correr
`xcodegen generate` (o simplemente reabrir el proyecto si usas Xcode 16+,
que sincroniza carpetas automáticamente).

Para una entrega a App Store Connect, crea primero un archive Release desde
Xcode. `ExportOptions.plist` deja versionadas las opciones de exportación del
equipo; no contiene certificados ni contraseñas. El archivo `.xcarchive`, los
perfiles y las credenciales de Apple permanecen fuera del repositorio.

## Estructura

```
Sources/OnRoadBooks/
  App/                  punto de entrada (OnRoadBooksApp.swift)
  AppRootView.swift     decide Login vs. modo demo vs. la app
  RootTabView.swift     tab bar de 5 pestañas, una vez autenticado
  DesignSystem/         Theme.swift (colores portados de globals.css),
                        Components.swift (panel, badges, stat tiles)
  Models/               Load, Expense, ReserveAccount, SettlementPeriod, ...
  Data/                 Repository.swift (protocolo),
                        MockRepository.swift (datos demo),
                        APIRepository.swift (cliente HTTP real + DTOs),
                        AuthSession.swift (login, token, logout),
                        KeychainHelper.swift, Config.swift (URL del API)
  Features/             una carpeta por pantalla (incluye Auth/LoginView)
Resources/
  Assets.xcassets/      AppIcon (vacío, ver abajo), AccentColor, LaunchBackground
```

## El backend: `/api/mobile/*` en la propia app Next.js

Revisé el `.env` real de la web app y la memoria del proyecto
(`onroadbooks_supabase.md`) antes de conectar nada, y encontré algo
importante: OnRoad Books **no** habla con Supabase vía su cliente con RLS.
Se conecta directo a Postgres desde el servidor con Prisma
(`DATABASE_URL` — una cadena de conexión completa a la base de datos), y
el login es scrypt + cookie firmada propio, no Supabase Auth.

Un `DATABASE_URL` es una credencial completa de base de datos — **jamás
debe vivir dentro del binario de una app móvil**: cualquiera podría
extraerlo del IPA y leer o escribir todo el ledger directo, saltándose
cada regla de negocio (costsPosted, snapshots de settlement, matemática de
reservas) que hoy solo existe en el código de la web app.

Por eso, en `OnroadBooks` (el repo de la web, no este) se agregaron:

- `src/lib/auth/mobile.ts` — `getMobileSession()`: el MISMO token firmado
  que usa la cookie web (`encodeSession`/`decodeSession`), leído de un
  header `Authorization: Bearer` en vez de una cookie.
- `POST /api/mobile/login` — espejo de `/api/auth/login`, devuelve el
  token en el JSON en vez de ponerlo en una cookie.
- Las rutas `/api/mobile/*` cubren dashboard, cargas, gastos, combustible,
  facturas, reservas, cierres, reportes, IFTA y Fleet. Las lecturas reutilizan
  las mismas funciones de `lib/calculations` y `lib/finance` que usa la web;
  las escrituras pasan por sus mismas validaciones y reglas de negocio.

La app ya se ha compilado correctamente para el simulador de iOS y el backend
se valida en CI junto con TypeScript, lint, pruebas unitarias y E2E.

## Ícono de la app

`Resources/Assets.xcassets/AppIcon.appiconset` está vacío. Arrastra un PNG
de 1024×1024 (puedes partir del logo ya usado en la web,
`public/marketing/logo.webp`, exportado sin transparencia y en cuadrado) al
slot "1024x1024" del icon set en Xcode — desde Xcode 14 basta con esa sola
imagen, Xcode genera el resto de tamaños.
