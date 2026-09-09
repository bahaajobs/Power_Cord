/* Localisation. English is the default; Arabic mirrors the whole layout.
 *
 * RTL is a layout property, not a translation: `dir` on <html> flips flexbox,
 * grid, padding shorthands and text alignment. The CSS deliberately avoids
 * `left:`/`right:` in favour of logical properties so this works. */

const STRINGS = {
  en: {
    'app.name': 'Power Cord',
    'app.tagline': 'Control your strips directly. No vendor cloud.',

    'act.signIn': 'Sign in', 'act.save': 'Save', 'act.cancel': 'Cancel',
    'act.add': 'Add', 'act.next': 'Next', 'act.back': 'Back', 'act.done': 'Done',
    'act.delete': 'Delete', 'act.rename': 'Rename', 'act.retry': 'Retry',
    'act.close': 'Close', 'act.skip': 'Skip', 'act.test': 'Test connection',
    'act.scan': 'Scan my network', 'act.addManually': 'Add manually',

    'home.totalNow': 'Total power right now',
    'home.stripsOnline': '{n} strips online', 'home.stripOnline': '{n} strip online',
    'home.outletsOn': '{on}/{total} outlets on',
    'home.plansActive': '{n} plans active', 'home.planActive': '{n} plan active',
    'home.search': 'Search strips and outlets',
    'home.noMatch': 'Nothing matches “{q}”.',
    'home.empty': 'No strips yet. Add your first one to get started.',
    'home.addStrip': 'Add strip',

    'quick.consumption': 'Consumption', 'quick.schedules': 'Schedules',
    'quick.automation': 'Power automation', 'quick.allOff': 'All off',

    'strip.online': 'ONLINE', 'strip.offline': 'OFFLINE',
    'strip.local': 'Local · direct', 'strip.remote': 'Remote · direct',
    'strip.viaServer': 'Via server', 'strip.noPlan': 'Direct control · no plan',
    'strip.planEnds': 'Plan ends {date}',
    'strip.noMeter': 'no meter', 'strip.allOn': 'Turn all on', 'strip.allOff': 'Turn all off',
    'strip.usb': 'USB ports', 'outlet.default': 'Outlet {n}', 'strip.powered': 'powered', 'strip.off': 'off',
    'strip.switching': 'SWITCHING…', 'strip.on': 'ON', 'strip.stateOff': 'OFF',
    'strip.settings': 'Strip settings', 'strip.revealId': 'Show full device id',
    'strip.hideId': 'Hide full device id',

    'energy.title': 'All strips', 'energy.eyebrow': 'Energy',
    'energy.days': '{n} days', 'energy.totalUsed': 'Total used',
    'energy.estCost': 'Estimated cost', 'energy.tariff': 'Tariff',
    'energy.daily': 'Daily usage', 'energy.perDay': 'kWh / day',
    'energy.tapBar': 'Tap a bar for details', 'energy.byStrip': 'By strip',
    'energy.lastDays': 'last {n} days', 'energy.avg': 'avg',
    'energy.noneRecorded': 'No energy recorded in the last {n} days. Strips without a metering chip never record any.',
    'energy.footnote': 'The meter in these strips sits upstream of all four relays, so this is the whole strip, never a single outlet. Cost is an estimate for what is plugged in here — not your household bill.',
    'energy.syncedAt': 'Synced with the strip {time}',

    'tariff.title': 'Tariff',
    'tariff.sub': "Egyptian residential supply is billed in rising brackets, so the rate depends on your household's monthly total. Enter that from your bill to get the marginal bracket right.",
    'tariff.currency': 'Currency', 'tariff.mode': 'Mode',
    'tariff.flat': 'Single rate', 'tariff.brackets': 'Rising brackets',
    'tariff.rate': 'Single rate per kWh',
    'tariff.mtd': 'Household use so far this month (kWh, from your bill)',
    'tariff.bracketsHelp': 'Brackets (kWh up to → rate). Blank upper limit = top bracket.',

    'sched.title': 'Schedules', 'sched.eyebrow': 'Timers',
    'sched.none': 'No schedules yet.', 'sched.add': 'Add a schedule',
    'sched.new': 'New schedule', 'sched.weekly': 'Weekly', 'sched.countdown': 'Countdown',
    'sched.time': 'Time', 'sched.days': 'Days', 'sched.action': 'Action',
    'sched.turnOn': 'Turn on', 'sched.turnOff': 'Turn off',
    'sched.minutes': 'Minutes from now', 'sched.target': 'Target',
    'sched.allOutlets': 'All outlets', 'sched.strip': 'Strip',
    'sched.type': 'Type', 'sched.disabled': 'disabled', 'sched.fired': 'fired',
    'sched.inMin': 'in {n} min',
    'sched.runsOnPhone': 'These run on your phone while the app is open, or on your server if you use one. A schedule cannot fire while nothing is running.',

    'auto.title': 'Power automation', 'auto.eyebrow': 'Rules',
    'auto.none': 'No rules yet.', 'auto.add': 'Add a rule', 'auto.new': 'New rule',
    'auto.standby': 'Standby cutoff', 'auto.overload': 'Overload',
    'auto.threshold': 'Threshold (W)', 'auto.idleFor': 'Idle for (minutes)',
    'auto.alsoCut': 'Also switch the strip off',
    'auto.standbyDesc': 'Cut when under {w} W for {m} min',
    'auto.overloadDesc': 'Alarm over {w} W', 'auto.andCut': ' and cut',
    'auto.needsMeter': 'this strip has no meter',
    'auto.intro': 'Rules that watch the meter. They need a strip that actually has a metering chip.',

    'setup.title': 'Set up a strip', 'setup.eyebrow': 'First time',
    'setup.step': 'Step {n} of {total}',
    'setup.s1.title': 'Flash the strip first',
    'setup.s1.body': 'A strip straight out of its Korean box cannot talk to this app — it only speaks to a cloud you cannot reach. It has to be re-flashed with open firmware (OpenBeken or ESPHome) first. The repository documents how.',
    'setup.s1.warn': 'Mains voltage. Unplug the strip before opening it, and never work on a live circuit.',
    'setup.s2.title': 'Join it to your Wi-Fi',
    'setup.s2.body': 'After flashing, the strip starts its own Wi-Fi network named after the firmware. Join that network from your phone, open 192.168.4.1, and enter your home Wi-Fi name and password. The strip reboots and joins your network.',
    'setup.s3.title': 'Find its address',
    'setup.s3.body': 'Open your router\'s device list and find the strip — it appears under its firmware name. Note the IP address it was given, for example 192.168.1.42. Set a static lease for it in the router so the address never changes.',
    'setup.s4.title': 'Protect it',
    'setup.s4.body': 'In the strip\'s own web page, set a username and password under Config. Freshly flashed firmware is wide open, and its firmware-update page accepts any file. Do this before the strip leaves your desk.',
    'setup.s5.title': 'Add it here',
    'setup.s5.body': 'Scan your network, or enter the address by hand. The app talks straight to the strip — nothing else is involved when you are at home.',
    'setup.openGuide': 'Setup guide',

    'add.title': 'Add a strip', 'add.name': 'Name',
    'add.lanHost': 'Address on your Wi-Fi', 'add.lanHostHint': 'e.g. 192.168.1.42',
    'add.remoteHost': 'Address from outside (optional)',
    'add.remoteHostHint': 'e.g. myhome.ddns.net:8081 — needs a port forward in your router',
    'add.user': 'Username (if you set one)', 'add.pass': 'Password',
    'add.outlets': 'Switchable outlets', 'add.hasUsb': 'Has a switchable USB rail',
    'add.usbChannel': 'USB relay channel',
    'add.testing': 'Testing…', 'add.reachable': 'Reachable — {n} outlets responding',
    'add.unreachable': 'Could not reach it: {err}',
    'add.scanning': 'Scanning {done}/{total} addresses…',
    'add.scanFound': 'Found {n} strips', 'add.scanNone': 'No strips found on this network.',
    'add.scanNative': 'Network scanning needs the Android app. In a browser, add the address by hand.',

    'settings.title': 'Settings', 'settings.language': 'Language',
    'settings.mode': 'Connection', 'settings.direct': 'Direct to strips',
    'settings.server': 'Through a server',
    'settings.directHelp': 'The app talks straight to each strip. Nothing else needs to run.',
    'settings.serverHelp': 'The app talks to a Power Cord server, which reaches the strips over MQTT.',
    'settings.serverUrl': 'Server address', 'settings.poll': 'Refresh every (seconds)',
    'settings.history': 'Local history', 'settings.historyKept': '{n} days kept on this phone',
    'settings.exportHistory': 'Export history', 'settings.clearHistory': 'Clear history',
    'settings.about': 'About', 'settings.signOut': 'Sign out',

    'ds.deviceId': 'Device id', 'ds.address': 'Address', 'ds.remote': 'Remote address',
    'ds.firmware': 'Firmware', 'ds.metering': 'Metering', 'ds.lastSeen': 'Last seen',
    'ds.reporting': 'reporting', 'ds.noneDetected': 'none detected', 'ds.never': 'never',
    'ds.outlets': 'Outlets', 'ds.channel': 'channel {n}', 'ds.usbRail': 'USB rail',
    'ds.locked': 'locked', 'ds.lockHelp': 'Locking blocks this app from switching an outlet — useful for the one feeding your router. It does not disable the button on the strip.',
    'ds.renameStrip': 'Rename strip', 'ds.setPlan': 'Set plan expiry', 'ds.remove': 'Remove strip',
    'ds.removeSure': 'Remove {name}?',
    'ds.removeBody': 'Its local history is deleted too. The strip itself keeps working from its buttons.',

    'err.offline': 'Not connected — showing the last known state.',
    'err.unreachable': 'Cannot reach this strip.',
    'err.noConfirm': 'The strip did not confirm. Showing its actual state.',
    'err.locked': '{name} is locked.',
    'err.stripOffline': 'That strip is offline.',
    'err.badAuth': 'Wrong username or password for the strip.',
    'confirm.allOffTitle': 'Switch everything off?',
    'confirm.allOffBody': 'Every outlet on every strip, including anything you may be relying on right now.',
    'confirm.allOffYes': 'Switch all off',
    'ok.added': 'Strip added.', 'ok.saved': 'Saved.', 'ok.allOff': 'All outlets switched off.',
    'ok.created': 'Created.', 'ok.removed': 'Removed.',

    'safety.note': 'An outlet switched off here is not electrically dead — these strips switch live only. Unplug before working on anything.',
  },

  ar: {
    'app.name': 'باور كورد',
    'app.tagline': 'تحكّم في مشترِكاتك مباشرةً. بدون سحابة الشركة المصنّعة.',

    'act.signIn': 'تسجيل الدخول', 'act.save': 'حفظ', 'act.cancel': 'إلغاء',
    'act.add': 'إضافة', 'act.next': 'التالي', 'act.back': 'رجوع', 'act.done': 'تم',
    'act.delete': 'حذف', 'act.rename': 'إعادة تسمية', 'act.retry': 'إعادة المحاولة',
    'act.close': 'إغلاق', 'act.skip': 'تخطّي', 'act.test': 'اختبار الاتصال',
    'act.scan': 'ابحث في شبكتي', 'act.addManually': 'إضافة يدويًا',

    'home.totalNow': 'إجمالي الاستهلاك الآن',
    'home.stripsOnline': '{n} مشترك متصل', 'home.stripOnline': '{n} مشترك متصل',
    'home.outletsOn': '{on}/{total} مخرج يعمل',
    'home.plansActive': '{n} اشتراك فعّال', 'home.planActive': '{n} اشتراك فعّال',
    'home.search': 'ابحث عن مشترك أو مخرج',
    'home.noMatch': 'لا توجد نتائج لـ «{q}».',
    'home.empty': 'لا توجد مشترِكات بعد. أضف الأول للبدء.',
    'home.addStrip': 'إضافة مشترك',

    'quick.consumption': 'الاستهلاك', 'quick.schedules': 'المواعيد',
    'quick.automation': 'الأتمتة', 'quick.allOff': 'إطفاء الكل',

    'strip.online': 'متصل', 'strip.offline': 'غير متصل',
    'strip.local': 'محلي · مباشر', 'strip.remote': 'خارجي · مباشر',
    'strip.viaServer': 'عبر الخادم', 'strip.noPlan': 'تحكّم مباشر · بدون اشتراك',
    'strip.planEnds': 'ينتهي الاشتراك في {date}',
    'strip.noMeter': 'بدون عدّاد', 'strip.allOn': 'تشغيل الكل', 'strip.allOff': 'إطفاء الكل',
    'strip.usb': 'منافذ USB', 'outlet.default': 'مخرج {n}', 'strip.powered': 'تعمل', 'strip.off': 'مطفأة',
    'strip.switching': 'جارٍ التبديل…', 'strip.on': 'يعمل', 'strip.stateOff': 'مطفأ',
    'strip.settings': 'إعدادات المشترك', 'strip.revealId': 'إظهار معرّف الجهاز',
    'strip.hideId': 'إخفاء معرّف الجهاز',

    'energy.title': 'كل المشترِكات', 'energy.eyebrow': 'الطاقة',
    'energy.days': '{n} يوم', 'energy.totalUsed': 'الإجمالي المستهلك',
    'energy.estCost': 'التكلفة التقديرية', 'energy.tariff': 'التعريفة',
    'energy.daily': 'الاستهلاك اليومي', 'energy.perDay': 'ك.و.س / يوم',
    'energy.tapBar': 'اضغط على عمود لعرض التفاصيل', 'energy.byStrip': 'حسب المشترك',
    'energy.lastDays': 'آخر {n} يوم', 'energy.avg': 'المتوسط',
    'energy.noneRecorded': 'لم تُسجَّل أي طاقة خلال آخر {n} يوم. المشترِكات بدون شريحة قياس لا تسجّل شيئًا.',
    'energy.footnote': 'عدّاد هذه المشترِكات يقع قبل المفاتيح الأربعة، لذا هذا قياس للمشترك كله وليس لمخرج واحد. التكلفة تقدير لما هو موصول هنا فقط — وليست فاتورة الكهرباء.',
    'energy.syncedAt': 'تمت المزامنة مع المشترك {time}',

    'tariff.title': 'التعريفة',
    'tariff.sub': 'الكهرباء المنزلية في مصر تُحتسب بشرائح تصاعدية، فالسعر يعتمد على إجمالي استهلاك المنزل خلال الشهر. أدخل هذا الرقم من فاتورتك لضبط الشريحة الصحيحة.',
    'tariff.currency': 'العملة', 'tariff.mode': 'الطريقة',
    'tariff.flat': 'سعر ثابت', 'tariff.brackets': 'شرائح تصاعدية',
    'tariff.rate': 'السعر لكل ك.و.س',
    'tariff.mtd': 'استهلاك المنزل هذا الشهر (ك.و.س، من الفاتورة)',
    'tariff.bracketsHelp': 'الشرائح (حتى ك.و.س ← السعر). اترك الحد الأعلى فارغًا للشريحة الأخيرة.',

    'sched.title': 'المواعيد', 'sched.eyebrow': 'المؤقتات',
    'sched.none': 'لا توجد مواعيد بعد.', 'sched.add': 'إضافة موعد',
    'sched.new': 'موعد جديد', 'sched.weekly': 'أسبوعي', 'sched.countdown': 'عدّ تنازلي',
    'sched.time': 'الوقت', 'sched.days': 'الأيام', 'sched.action': 'الإجراء',
    'sched.turnOn': 'تشغيل', 'sched.turnOff': 'إطفاء',
    'sched.minutes': 'بعد كم دقيقة', 'sched.target': 'الهدف',
    'sched.allOutlets': 'كل المخارج', 'sched.strip': 'المشترك',
    'sched.type': 'النوع', 'sched.disabled': 'موقوف', 'sched.fired': 'نُفِّذ',
    'sched.inMin': 'بعد {n} دقيقة',
    'sched.runsOnPhone': 'تعمل هذه المواعيد على هاتفك أثناء فتح التطبيق، أو على الخادم إن كنت تستخدم واحدًا. لا يمكن تنفيذ موعد بينما لا يعمل أي منهما.',

    'auto.title': 'الأتمتة', 'auto.eyebrow': 'القواعد',
    'auto.none': 'لا توجد قواعد بعد.', 'auto.add': 'إضافة قاعدة', 'auto.new': 'قاعدة جديدة',
    'auto.standby': 'قطع استهلاك الاستعداد', 'auto.overload': 'الحمل الزائد',
    'auto.threshold': 'الحد (واط)', 'auto.idleFor': 'مدة الخمول (دقائق)',
    'auto.alsoCut': 'إطفاء المشترك أيضًا',
    'auto.standbyDesc': 'يقطع عند أقل من {w} واط لمدة {m} دقيقة',
    'auto.overloadDesc': 'تنبيه فوق {w} واط', 'auto.andCut': ' مع الإطفاء',
    'auto.needsMeter': 'هذا المشترك بدون عدّاد',
    'auto.intro': 'قواعد تراقب العدّاد. تحتاج مشتركًا يحتوي فعليًا على شريحة قياس.',

    'setup.title': 'إعداد مشترك', 'setup.eyebrow': 'الإعداد الأول',
    'setup.step': 'الخطوة {n} من {total}',
    'setup.s1.title': 'اِبدأ بتحديث البرنامج الثابت',
    'setup.s1.body': 'المشترك الكوري كما هو لا يستطيع التحدث مع هذا التطبيق — فهو لا يتصل إلا بسحابة لا يمكن الوصول إليها من هنا. يجب أولًا تحميل برنامج ثابت مفتوح (OpenBeken أو ESPHome). الطريقة موثّقة في المستودع.',
    'setup.s1.warn': 'جهد كهربائي 220 فولت. افصل المشترك عن الكهرباء قبل فتحه، ولا تعمل أبدًا على دائرة موصولة.',
    'setup.s2.title': 'وصّله بشبكة الواي فاي',
    'setup.s2.body': 'بعد التحديث ينشئ المشترك شبكة واي فاي خاصة به باسم البرنامج الثابت. اتصل بها من هاتفك، وافتح 192.168.4.1، ثم أدخل اسم شبكتك المنزلية وكلمة المرور. سيعيد المشترك التشغيل وينضم إلى شبكتك.',
    'setup.s3.title': 'اعرف عنوانه',
    'setup.s3.body': 'افتح قائمة الأجهزة في الراوتر وابحث عن المشترك — سيظهر باسم البرنامج الثابت. سجّل عنوان IP الممنوح له، مثل 192.168.1.42. ويُفضَّل حجز العنوان له في الراوتر حتى لا يتغيّر.',
    'setup.s4.title': 'أمِّنه',
    'setup.s4.body': 'من صفحة المشترك نفسه، اضبط اسم مستخدم وكلمة مرور من Config. البرنامج الثابت بعد التحديث مفتوح تمامًا، وصفحة تحديثه تقبل أي ملف. افعل ذلك قبل أن يغادر المشترك مكتبك.',
    'setup.s5.title': 'أضِفه هنا',
    'setup.s5.body': 'ابحث في شبكتك أو أدخل العنوان يدويًا. التطبيق يتصل بالمشترك مباشرة — لا شيء آخر في المنتصف عندما تكون في المنزل.',
    'setup.openGuide': 'دليل الإعداد',

    'add.title': 'إضافة مشترك', 'add.name': 'الاسم',
    'add.lanHost': 'العنوان على شبكتك', 'add.lanHostHint': 'مثال: 192.168.1.42',
    'add.remoteHost': 'العنوان من خارج المنزل (اختياري)',
    'add.remoteHostHint': 'مثال: myhome.ddns.net:8081 — يحتاج تحويل منفذ في الراوتر',
    'add.user': 'اسم المستخدم (إن وُجد)', 'add.pass': 'كلمة المرور',
    'add.outlets': 'عدد المخارج', 'add.hasUsb': 'يحتوي منفذ USB قابل للتحكم',
    'add.usbChannel': 'قناة مفتاح USB',
    'add.testing': 'جارٍ الاختبار…', 'add.reachable': 'تم الوصول — {n} مخارج تستجيب',
    'add.unreachable': 'تعذّر الوصول: {err}',
    'add.scanning': 'جارٍ فحص {done}/{total} عنوانًا…',
    'add.scanFound': 'تم العثور على {n} مشترك', 'add.scanNone': 'لم يُعثر على مشترِكات في هذه الشبكة.',
    'add.scanNative': 'فحص الشبكة يحتاج تطبيق أندرويد. في المتصفح، أدخل العنوان يدويًا.',

    'settings.title': 'الإعدادات', 'settings.language': 'اللغة',
    'settings.mode': 'طريقة الاتصال', 'settings.direct': 'مباشرة بالمشترِكات',
    'settings.server': 'عبر خادم',
    'settings.directHelp': 'يتصل التطبيق بكل مشترك مباشرة. لا حاجة لتشغيل أي شيء آخر.',
    'settings.serverHelp': 'يتصل التطبيق بخادم باور كورد، والخادم يصل إلى المشترِكات عبر MQTT.',
    'settings.serverUrl': 'عنوان الخادم', 'settings.poll': 'التحديث كل (ثانية)',
    'settings.history': 'السجل المحلي', 'settings.historyKept': '{n} يومًا محفوظة على هذا الهاتف',
    'settings.exportHistory': 'تصدير السجل', 'settings.clearHistory': 'مسح السجل',
    'settings.about': 'عن التطبيق', 'settings.signOut': 'تسجيل الخروج',

    'ds.deviceId': 'معرّف الجهاز', 'ds.address': 'العنوان', 'ds.remote': 'العنوان الخارجي',
    'ds.firmware': 'البرنامج الثابت', 'ds.metering': 'القياس', 'ds.lastSeen': 'آخر ظهور',
    'ds.reporting': 'يرسل بيانات', 'ds.noneDetected': 'غير موجود', 'ds.never': 'أبدًا',
    'ds.outlets': 'المخارج', 'ds.channel': 'القناة {n}', 'ds.usbRail': 'خط USB',
    'ds.locked': 'مقفل', 'ds.lockHelp': 'القفل يمنع التطبيق من تبديل المخرج — مفيد للمخرج الذي يغذّي الراوتر. لا يعطّل الزر الموجود على المشترك نفسه.',
    'ds.renameStrip': 'إعادة تسمية المشترك', 'ds.setPlan': 'تحديد نهاية الاشتراك', 'ds.remove': 'حذف المشترك',
    'ds.removeSure': 'حذف {name}؟',
    'ds.removeBody': 'سيُحذف سجله المحلي أيضًا. المشترك نفسه يستمر في العمل بأزراره.',

    'err.offline': 'غير متصل — تُعرض آخر حالة معروفة.',
    'err.unreachable': 'تعذّر الوصول إلى هذا المشترك.',
    'err.noConfirm': 'لم يؤكّد المشترك التنفيذ. تُعرض حالته الفعلية.',
    'err.locked': '{name} مقفل.',
    'err.stripOffline': 'هذا المشترك غير متصل.',
    'err.badAuth': 'اسم المستخدم أو كلمة المرور غير صحيحة.',
    'confirm.allOffTitle': 'إطفاء كل شيء؟',
    'confirm.allOffBody': 'كل مخرج في كل مشترك، بما في ذلك أي جهاز قد تعتمد عليه الآن.',
    'confirm.allOffYes': 'إطفاء الكل',
    'ok.added': 'تمت إضافة المشترك.', 'ok.saved': 'تم الحفظ.', 'ok.allOff': 'تم إطفاء كل المخارج.',
    'ok.created': 'تم الإنشاء.', 'ok.removed': 'تم الحذف.',

    'safety.note': 'المخرج المطفأ هنا ليس معزولًا كهربائيًا — هذه المشترِكات تفصل الطرف الحي فقط. افصل القابس قبل العمل على أي جهاز.',
  },
};

export const LANGS = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
];

// English is the default, per spec, and also the fallback for any key that has
// not been translated yet — a missing Arabic string shows English, never a
// blank or a raw key.
let current = 'en';

export function setLang(code) {
  current = STRINGS[code] ? code : 'en';
  const dir = current === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = current;
  document.documentElement.dir = dir;
  try { localStorage.setItem('pc.lang', current); } catch { /* private mode */ }
  return current;
}

export function getLang() { return current; }
export function isRtl() { return current === 'ar'; }

export function initLang() {
  let saved = null;
  try { saved = localStorage.getItem('pc.lang'); } catch { /* private mode */ }
  return setLang(saved || 'en');
}

const escHtml = (v) => String(v).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Like t(), but the template is escaped first and the values are inserted as
 * raw HTML. Lets a translated sentence carry emphasis without the translation
 * itself containing markup — word order differs between English and Arabic, so
 * the placeholder has to move with the sentence.
 */
export function tHtml(key, vars) {
  let s = escHtml(STRINGS[current]?.[key] ?? STRINGS.en[key] ?? key);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

/** t('home.outletsOn', {on: 2, total: 4}) */
export function t(key, vars) {
  let s = STRINGS[current]?.[key] ?? STRINGS.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

/** Arabic-Indic digits when the interface is Arabic, so numbers match the text. */
export function num(n, digits) {
  const v = typeof digits === 'number' ? Number(n).toFixed(digits) : String(n);
  if (current !== 'ar') return v;
  return v.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
}

export function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(current === 'ar' ? 'ar-EG' : undefined,
    { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString(current === 'ar' ? 'ar-EG' : undefined,
    { hour: '2-digit', minute: '2-digit' });
}
