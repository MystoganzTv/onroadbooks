# OnRoad Books — iOS (SwiftUI)

App nativa en Swift/SwiftUI para OnRoad Books, la "cabina financiera" para
owner-operators. Mismo lenguaje visual que la web app (colores, tipografía,
tarjetas, disciplina de color verde/rojo), traducido a componentes nativos
de iOS — y ahora conectada de verdad al mismo backend que usa la web.

## Qué incluye

- Login con contraseña y Google; registro y recuperación con formularios nativos.
- Dashboard, cargas, gastos, combustible, calculadora y reportes sobre el mismo
  libro y los mismos cálculos que la web, con período y camión seleccionados.
- Gestión nativa de brokers/contactos, dispatchers, financiamiento y clasificación
  de pagos, camiones/mantenimiento, choferes, reservas, IFTA, metas y negocio.
- Edición completa de cargas, lectura de rate confirmations con revisión antes de
  guardar, facturas opcionales y PDF para compartir.
- Documentos: adjuntar PDF/imágenes, consultar, descargar y eliminar.
- Analytics de rutas/brokers y costo por milla; cuenta y catálogo real de planes.
- Apariencia clara, oscura o del sistema, tamaño de texto accesible y bloqueo
  biométrico opcional; restablecimiento de datos y eliminación de cuenta.

Los formularios de `Features/Management` usan un catálogo de campos cerrado del
servidor, renderizado mediante `Form`, `TextField`, `Picker`, `Toggle` y
`DatePicker` de SwiftUI. No ejecutan HTML ni abren la web para gestionar datos.

La paridad **todavía no es completa**. Consulta [PARITY.md](PARITY.md) para el
alcance verificado y los pendientes, especialmente las suscripciones de Apple.

## Datos: reales, no solo demo

La app ya habla con el backend real vía `APIRepository` (`URLSession` liso,
sin SDK de terceros) contra las rutas `/api/mobile/*` que se agregaron a la
propia app Next.js — ver la sección de abajo. Al no iniciar sesión, el
botón "Ver con datos de muestra" cae a `MockRepository`, sembrado con las
cifras reales de agosto ($9,795.00 / $6,143.90 / $3,651.10 / $1.84 CPM /
$2,235.23 safe-to-pay) para que la app se vea con números creíbles incluso
sin cuenta.

Las rutas existentes usan producción por defecto. Las nuevas rutas de gestión
requieren desplegar este cambio de backend y distribuir una nueva build de iOS;
una compilación local no actualiza los clientes ya instalados. El modo de muestra
sigue siendo deliberado y no simula escrituras en las secciones nuevas.

## Por qué no hay un `.xcodeproj` ya generado

El proyecto de Xcode se genera con [XcodeGen](https://github.com/yonaskolb/XcodeGen)
a partir de `project.yml`. Los fuentes, recursos, configuración y pruebas viven
como texto en este repositorio; el proyecto generado queda fuera de Git.

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
equipo, permite a Apple administrar un build number válido y no contiene
certificados ni contraseñas. El archivo `.xcarchive`, el `.ipa`, los perfiles y
las credenciales de Apple permanecen fuera del repositorio.

CI valida dos productos diferentes: Debug para el simulador y Release sin
firma para `iphoneos/arm64`. La firma de distribución y la instalación en un
dispositivo real se validan localmente, donde sí existen la cuenta y el
llavero de Apple.

## Estructura

```
Sources/OnRoadBooks/
  App/                  punto de entrada (OnRoadBooksApp.swift)
  AppRootView.swift     decide Login vs. modo demo vs. la app
  RootTabView.swift     tab bar de 4 pestañas, una vez autenticado
  DesignSystem/         Theme.swift (colores portados de globals.css),
                        Components.swift (panel, badges, stat tiles)
  Models/               Load, Expense, ReserveAccount, CalculatorDefaults, ...
  Data/                 Repository.swift (protocolo),
                        MockRepository.swift (datos demo),
                        APIRepository.swift (cliente HTTP real + DTOs),
                        AuthSession.swift (login, token, logout),
                        KeychainHelper.swift, Config.swift (URL del API)
  Features/             una carpeta por pantalla (incluye Auth/LoginView)
Resources/
  Assets.xcassets/      AppIcon 1024×1024, AccentColor, LaunchBackground
```

## El backend: `/api/mobile/*` en la propia app Next.js

Las credenciales de base de datos y almacenamiento permanecen en el servidor.
`getMobileSession()` valida el token Bearer y su pertenencia al negocio; las rutas
obtienen el repositorio limitado a ese negocio. Las escrituras aplican permisos,
plan y los mismos esquemas y métodos de repositorio que utiliza la web.

`/api/mobile/manage/[resource]` expone únicamente los 19 recursos definidos en
`src/lib/mobile/management.ts`. No acepta nombres de tablas o métodos arbitrarios.
Las descargas de almacenamiento firmado usan una petición independiente para no
reenviar el token de sesión al proveedor de archivos.

La app se compila en CI tanto para el simulador como para `iphoneos/arm64`, y
el backend se valida junto con TypeScript, lint, pruebas unitarias y E2E.

## Preparar un build para TestFlight

El ícono universal ya está en
`Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png`: mide 1024×1024,
es RGB y no tiene transparencia. Xcode genera los tamaños de iPhone y iPad al
compilar el asset catalog.

Con el Team configurado en `Signing.xcconfig`, crea y exporta un build sin
guardar credenciales en el repositorio:

```bash
xcodebuild \
  -project OnRoadBooksMobile.xcodeproj \
  -scheme OnRoadBooks \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$TMPDIR/OnRoadBooks.xcarchive" \
  -allowProvisioningUpdates \
  archive

xcodebuild \
  -exportArchive \
  -archivePath "$TMPDIR/OnRoadBooks.xcarchive" \
  -exportPath "$TMPDIR/OnRoadBooksExport" \
  -exportOptionsPlist ExportOptions.plist \
  -allowProvisioningUpdates
```

Antes de subirlo, instala una build Debug firmada en un iPhone físico y abre
la app para verificar arranque, login y conexión con producción. El `.ipa`
exportado usa distribución App Store y se instala mediante TestFlight, no
directamente con `devicectl`.

## Retirada de owner statements

La pestaña y las acciones de cierre/reapertura se retiraron. Los enlaces web
antiguos redirigen a Reports; `/api/mobile/settlements` responde 410 a clientes
autenticados (401 sin sesión). Se conservan los snapshots históricos y los
vínculos de reservas. Los pagos de choferes de Fleet son otra función.

Los clientes ya instalados necesitan una nueva build para cambiar su interfaz.
El backend conserva los campos antiguos de la calculadora con asignaciones en
cero y disponibilidad falsa para no romper la decodificación de esas versiones.
La build nueva solo utiliza costos del viaje y el contexto mensual separado.
