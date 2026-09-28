# Paridad nativa con la web

Revisión: 27 de septiembre de 2026. Estado: cambios locales; requieren despliegue
del backend y una nueva distribución de iOS. No equivalen a una entrega publicada.

## Cobertura de esta entrega

| Área | Pantallas y acciones nativas |
| --- | --- |
| Brokers | Perfiles, historial de cargas, contactos, unificación y eliminación de perfiles |
| Dispatchers | Directorio, contacto, cargas y comisiones |
| Financiamiento | Préstamos/arrendamientos, saldos, próximos pagos, clasificación de principal/interés |
| Camiones | Crear/editar, retirar/reactivar, referencia MPG, perfil de costos y excepciones |
| Mantenimiento | Registrar/editar/eliminar servicios y su gasto vinculado, próximos vencimientos |
| Choferes | Datos, asignación y acuerdos de pago, sin exigir Fleet para su gestión básica |
| Cargas | Formulario completo con asignación/equipo/costos; lectura de rate confirmations con revisión |
| Facturas | Emitir/editar documento opcional y compartir PDF; se elimina el antiguo flujo de cobros incompatible con la web actual |
| Documentos | Adjuntar PDF/imágenes a cargas/gastos/camiones/servicios, consultar y eliminar |
| Reservas | Cubetas, porcentajes, metas y movimientos manuales |
| IFTA | Selección de trimestre, tarifas históricas y millas reales por jurisdicción |
| Analytics | Costo operativo, deuda y caja por milla, categorías y referencia histórica según plan; rutas/brokers existentes |
| Negocio | Nombre, configuración financiera, clasificación fijo/variable y metas |
| Cuenta | Plan/estado real, catálogo, restablecimiento de datos y eliminación con confirmación |
| Acceso | Registro con contraseña, recuperación y aceptación de invitaciones pegando el enlace recibido |
| Preferencias | Apariencia clara/oscura/sistema y tamaño de texto respetando accesibilidad del dispositivo |

Los formularios son controles SwiftUI. El servidor entrega datos y metadatos de
un catálogo cerrado, nunca HTML o código ejecutable. Las escrituras pasan por
las validaciones, permisos y repositorios compartidos con la web.

También se corrigen el filtro de camión en dashboard/cargas/gastos/combustible/
analytics y la pérdida de `referenceMpg` al modificar IFTA desde la pantalla
anterior. Las modificaciones nuevas notifican a los resúmenes para recargarse.

## Diferencias que siguen abiertas

- **Suscripciones nativas:** la build 4 incorpora StoreKit 2 para Starter/Pro,
  restauración, precios localizados y gestión de suscripciones. El servidor
  valida firmas de Apple y consulta el estado actual antes de conceder acceso.
  La activación pública requiere configurar la clave IAP y las notificaciones
  V2, comprobar una compra sandbox y seleccionar la nueva build en Apple.
  Fleet permanece excluido de la oferta móvil.
- **Idioma y presentación:** sigue existiendo mezcla de inglés/español en
  pantallas heredadas y etiquetas. No se ha completado un selector de idioma ni
  reproducido cada visualización o modo simple/detallado de la web.
- **Enlaces de acceso:** Google mantiene el flujo seguro de autenticación del
  sistema. Recuperación permite pegar el enlace en el formulario nativo; no hay
  universal links para abrir automáticamente recuperación/invitaciones. El
  asistente guiado de bienvenida no está reproducido íntegramente, aunque
  registro y edición de negocio/camión existen.
- **Administración interna:** la consola de operador `/admin` no está portada.
  Fleet y Driver Pay permanecen fuera del menú según ADR 0031, igual que en la
  navegación actual de la web; no se reactivan funciones retiradas.
- **Archivos:** la subida móvil multipart tiene un máximo de 4 MB. No utiliza
  todavía la subida directa de mayor tamaño de la web. Las escrituras nuevas de
  gestión requieren conexión; no se prometen como operaciones sin conexión.

## Verificación y límites

- TypeScript, ESLint y suite de 570 pruebas del backend pasan.
- `mobile-management.test.ts` verifica persistencia, validaciones, conservación
  de campos, IFTA histórico, facturas, duplicados, permisos y límites del plan.
- `scripts/mobile-parity-smoke.ts` cubre por HTTP los 19 catálogos, autenticación,
  vínculo sesión/negocio, CRUD, PDF y el ciclo de documentos contra JSON local.
  Ese backend de prueba es de un solo negocio: no certifica aislamiento completo
  entre bases/negocios reales en producción.
- XCUITest usa exclusivamente `127.0.0.1:4173`, cuentas efímeras y simulador.
  Prueba brokers, financiamiento, apariencia clara y registro; comprueba el
  broker guardado con una lectura API independiente. No envía correos ni
  efectúa compras.
- Las compilaciones de simulador y Release sin firma no sustituyen pruebas de
  distribución, instalación en iPhone físico o revisión de App Store.
- No se ha ejecutado OCR con un proveedor real ni recuperación por correo real
  en esta verificación. Tampoco se ha certificado el almacenamiento remoto de
  producción o la configuración Auth.js mediante estas pruebas locales.

## Ejecutar la verificación local

Crear un directorio de datos desechable y levantar el backend sin servicios
externos (no usar datos de producción):

```sh
DATA_SOURCE=json AUTH_PROVIDER=legacy DOCUMENT_STORAGE=local \
ONROAD_DATA_DIR=/tmp/onroad-native-verification \
AUTH_SECRET=native-parity-test-only-secret-at-least-32-characters \
NEXT_PUBLIC_APP_URL=http://127.0.0.1:4173 \
RESEND_API_KEY= STRIPE_SECRET_KEY= STRIPE_WEBHOOK_SECRET= ANTHROPIC_API_KEY= \
npm run dev -- --hostname 127.0.0.1 --port 4173
```

Con el servidor activo:

```sh
node --conditions=react-server --import tsx scripts/mobile-parity-smoke.ts
cd mobile
xcodegen generate
xcodebuild -project OnRoadBooksMobile.xcodeproj -scheme OnRoadBooks \
  -destination 'platform=iOS Simulator,name=<simulador disponible>' \
  CODE_SIGNING_ALLOWED=NO test
```

`ONROAD_API_BASE_URL` solo se acepta en Debug dentro del simulador y para loopback.
Las builds Release y los dispositivos físicos siguen utilizando producción.
