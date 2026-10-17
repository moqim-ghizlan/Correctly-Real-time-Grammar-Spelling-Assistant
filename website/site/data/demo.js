// Predefined demo results. Synthetic, non-personal texts written for this
// page; nothing here was produced by a live AI call. One list per site
// language, same shape everywhere (checked by scripts/check-i18n.mjs).
//
// rewrite.custom holds the five formality levels, 1 (light touch) to 5.
// translation keys: language ids, with Arabic split into ar_msa / ar_syrian.
(function () {
  const DEMO = {
    fr: [
      {
        lang: 'fr',
        text: 'Bonjour Claire, je suis aller a la réunion de lundi mais j’ai oublier le dossier sur mon bureau. Les chiffres du troisième trimestre son prêt, je te les envoie demain avant 10 h. Si tu a des questions sur le budget, appelle moi.',
        correction:
          'Bonjour Claire, je suis allé à la réunion de lundi mais j’ai oublié le dossier sur mon bureau. Les chiffres du troisième trimestre sont prêts, je te les envoie demain avant 10 h. Si tu as des questions sur le budget, appelle-moi.',
        rewrite: {
          professional:
            'Bonjour Claire, j’ai bien assisté à la réunion de lundi, mais j’ai oublié le dossier à mon bureau. Les chiffres du troisième trimestre sont prêts : je te les transmets demain avant 10 h. Pour toute question sur le budget, n’hésite pas à m’appeler.',
          formal:
            'Bonjour Claire, j’ai assisté à la réunion de lundi, mais j’ai malheureusement oublié le dossier à mon bureau. Les chiffres du troisième trimestre sont prêts ; je vous les ferai parvenir demain avant 10 h. Pour toute question relative au budget, je reste à votre disposition par téléphone.',
          friendly:
            'Coucou Claire ! J’étais bien à la réunion de lundi, mais j’ai laissé le dossier sur mon bureau. Bonne nouvelle : les chiffres du troisième trimestre sont prêts, je te les envoie demain avant 10 h. Une question sur le budget ? Appelle-moi quand tu veux.',
          casual:
            'Salut Claire, j’étais à la réunion lundi mais j’ai oublié le dossier sur mon bureau. Les chiffres du T3 sont prêts, je te les envoie demain avant 10 h. Une question sur le budget ? Appelle-moi.',
          polite:
            'Bonjour Claire, j’ai bien participé à la réunion de lundi, mais j’ai oublié le dossier sur mon bureau. Les chiffres du troisième trimestre sont prêts et je te les enverrai demain avant 10 h. Si tu as des questions sur le budget, n’hésite surtout pas à m’appeler. Merci !',
          concise:
            'Claire, j’ai oublié au bureau le dossier de la réunion de lundi. Les chiffres du T3 sont prêts : envoi demain avant 10 h. Une question sur le budget ? Appelle-moi.',
          funny:
            'Bonjour Claire, j’étais bien à la réunion de lundi… le dossier, lui, a préféré rester sur mon bureau. Les chiffres du troisième trimestre sont prêts et partiront demain avant 10 h, promis. Une question sur le budget ? Appelle-moi, je réponds plus vite que mon dossier.',
          custom: [
            'Bonjour Claire, je suis allé à la réunion de lundi, mais j’ai oublié le dossier sur mon bureau. Les chiffres du troisième trimestre sont prêts, je te les envoie demain avant 10 h. Si tu as des questions sur le budget, appelle-moi.',
            'Bonjour Claire, j’étais à la réunion de lundi, mais j’ai oublié le dossier sur mon bureau. Les chiffres du troisième trimestre sont prêts, je te les envoie demain avant 10 h. Si tu as des questions sur le budget, appelle-moi.',
            'Bonjour Claire, j’ai assisté à la réunion de lundi, mais j’ai oublié le dossier sur mon bureau. Les chiffres du troisième trimestre sont prêts ; je te les envoie demain avant 10 h. Pour toute question sur le budget, appelle-moi.',
            'Bonjour Claire, j’ai bien assisté à la réunion de lundi, mais j’ai oublié le dossier à mon bureau. Les chiffres du troisième trimestre sont prêts et te parviendront demain avant 10 h. Pour toute question concernant le budget, n’hésite pas à m’appeler.',
            'Bonjour Claire, j’ai pris part à la réunion de lundi ; je constate toutefois avoir laissé le dossier à mon bureau. Les chiffres du troisième trimestre sont désormais prêts et vous seront transmis demain avant 10 h. Pour toute question relative au budget, je demeure à votre disposition par téléphone.',
          ],
        },
        translation: {
          en: 'Hi Claire, I went to Monday’s meeting but left the file on my desk. The third-quarter figures are ready; I’ll send them to you tomorrow before 10 a.m. If you have any questions about the budget, give me a call.',
          ar_msa:
            'مرحبًا كلير، حضرتُ اجتماع يوم الاثنين لكنني نسيتُ الملف على مكتبي. أرقام الربع الثالث جاهزة، وسأرسلها إليكِ غدًا قبل الساعة العاشرة صباحًا. إذا كانت لديكِ أي أسئلة حول الميزانية، فاتصلي بي.',
          ar_syrian:
            'مرحبا كلير، رحت عالاجتماع يوم الاتنين بس نسيت الملف على مكتبي. أرقام الربع التالت جاهزة، رح ابعتلك ياهن بكرا قبل الساعة عشرة الصبح. إذا عندك أي سؤال عن الميزانية، دقيلي.',
          tr: 'Merhaba Claire, pazartesi günkü toplantıya katıldım ama dosyayı masamda unuttum. Üçüncü çeyrek rakamları hazır; yarın saat 10’dan önce sana gönderiyorum. Bütçeyle ilgili soruların olursa beni ara.',
          de: 'Hallo Claire, ich war am Montag in der Besprechung, habe aber die Unterlagen auf meinem Schreibtisch vergessen. Die Zahlen für das dritte Quartal sind fertig; ich schicke sie dir morgen vor 10 Uhr. Wenn du Fragen zum Budget hast, ruf mich an.',
          es: 'Hola, Claire: fui a la reunión del lunes, pero me dejé el expediente en mi escritorio. Las cifras del tercer trimestre ya están listas; te las envío mañana antes de las 10. Si tienes alguna pregunta sobre el presupuesto, llámame.',
        },
        summary: {
          short: {
            paragraph:
              'Les chiffres du troisième trimestre arriveront demain avant 10 h, le dossier étant resté au bureau après la réunion de lundi.',
            points: [
              'Dossier oublié au bureau après la réunion de lundi.',
              'Chiffres du T3 envoyés demain avant 10 h.',
              'Questions sur le budget : par téléphone.',
            ],
          },
          medium: {
            paragraph:
              'Après la réunion de lundi, le dossier est resté sur le bureau de l’expéditeur. Les chiffres du troisième trimestre sont prêts et seront envoyés à Claire demain avant 10 h. Pour toute question sur le budget, un appel suffit.',
            points: [
              'Réunion de lundi : le dossier a été oublié au bureau.',
              'Les chiffres du troisième trimestre sont prêts.',
              'Envoi prévu demain avant 10 h.',
              'Questions sur le budget : par téléphone.',
            ],
          },
          detailed: {
            paragraph:
              'Ce message à Claire fait suite à la réunion de lundi : l’expéditeur y a assisté mais a oublié le dossier sur son bureau. Les chiffres du troisième trimestre sont prêts et seront envoyés le lendemain avant 10 h. Claire est invitée à appeler en cas de question sur le budget.',
            points: [
              'Destinataire : Claire.',
              'Contexte : la réunion de lundi.',
              'Problème : le dossier est resté sur le bureau.',
              'Les chiffres du troisième trimestre sont prêts.',
              'Échéance : envoi demain avant 10 h.',
              'Questions sur le budget : par téléphone.',
            ],
          },
        },
      },
      {
        lang: 'fr',
        text: 'Chers voisins, la fête de quartier aura lieu samedi 14 juin a partir de 15 h dans le jardin de la résidence. Chacun peu apporter un plat ou une boisson. En cas de pluie, nous nous retrouverons dans la salle commune. Merci de confirmé votre présence avant mercredi.',
        correction:
          'Chers voisins, la fête de quartier aura lieu samedi 14 juin à partir de 15 h dans le jardin de la résidence. Chacun peut apporter un plat ou une boisson. En cas de pluie, nous nous retrouverons dans la salle commune. Merci de confirmer votre présence avant mercredi.',
        rewrite: {
          professional:
            'Chers voisins, la fête de quartier se tiendra le samedi 14 juin à partir de 15 h, dans le jardin de la résidence. Chacun est invité à apporter un plat ou une boisson. En cas de pluie, elle aura lieu dans la salle commune. Merci de confirmer votre présence d’ici mercredi.',
          formal:
            'Chers voisins, nous avons le plaisir de vous convier à la fête de quartier, qui se tiendra le samedi 14 juin à partir de 15 h dans le jardin de la résidence. Chacun pourra apporter un plat ou une boisson. En cas d’intempéries, elle aura lieu dans la salle commune. Nous vous remercions de bien vouloir confirmer votre présence avant mercredi.',
          friendly:
            'Bonjour à tous ! La fête de quartier, c’est samedi 14 juin à partir de 15 h, dans le jardin de la résidence. Apportez un plat ou une boisson à partager. S’il pleut, on se retrouve dans la salle commune. Dites-nous avant mercredi si vous venez !',
          casual:
            'Salut les voisins ! Fête de quartier samedi 14 juin, à partir de 15 h dans le jardin. Ramenez un plat ou à boire. S’il pleut, ce sera dans la salle commune. Dites-nous d’ici mercredi si vous venez.',
          polite:
            'Chers voisins, nous serions ravis de vous accueillir à la fête de quartier, le samedi 14 juin à partir de 15 h dans le jardin de la résidence. Si vous le souhaitez, vous pouvez apporter un plat ou une boisson. En cas de pluie, nous nous retrouverons dans la salle commune. Merci de bien vouloir confirmer votre présence avant mercredi.',
          concise:
            'Fête de quartier samedi 14 juin dès 15 h, jardin de la résidence (salle commune s’il pleut). Apportez un plat ou une boisson. Confirmation avant mercredi.',
          funny:
            'Chers voisins, la fête de quartier débarque samedi 14 juin à partir de 15 h dans le jardin de la résidence. Apportez un plat ou une boisson : les mains vides sont acceptées, les assiettes vides beaucoup moins. S’il pleut, repli stratégique dans la salle commune. Merci de confirmer avant mercredi, qu’on prévoie assez de chaises.',
          custom: [
            'Chers voisins, la fête de quartier aura lieu samedi 14 juin à partir de 15 h dans le jardin de la résidence. Chacun peut apporter un plat ou une boisson. En cas de pluie, nous nous retrouverons dans la salle commune. Merci de confirmer votre présence avant mercredi.',
            'Chers voisins, la fête de quartier, c’est samedi 14 juin à partir de 15 h dans le jardin de la résidence. Chacun peut apporter un plat ou une boisson. S’il pleut, on se retrouvera dans la salle commune. Merci de confirmer votre présence avant mercredi.',
            'Chers voisins, la fête de quartier aura lieu le samedi 14 juin à partir de 15 h dans le jardin de la résidence. Chacun peut apporter un plat ou une boisson. En cas de pluie, nous nous retrouverons dans la salle commune. Merci de confirmer votre présence avant mercredi.',
            'Chers voisins, la fête de quartier se tiendra le samedi 14 juin à partir de 15 h dans le jardin de la résidence. Chacun est invité à apporter un plat ou une boisson. En cas de pluie, nous nous réunirons dans la salle commune. Merci de bien vouloir confirmer votre présence avant mercredi.',
            'Chers voisins, nous avons l’honneur de vous convier à la fête de quartier, qui se tiendra le samedi 14 juin à compter de 15 h dans le jardin de la résidence. Chacun est cordialement invité à apporter un mets ou une boisson. En cas d’intempéries, la réunion se tiendra dans la salle commune. Nous vous saurions gré de bien vouloir confirmer votre présence avant mercredi.',
          ],
        },
        translation: {
          en: 'Dear neighbours, the street party will take place on Saturday 14 June from 3 pm in the residence garden. Everyone can bring a dish or a drink. If it rains, we will meet in the common room. Please confirm whether you are coming by Wednesday.',
          ar_msa:
            'جيراننا الأعزاء، ستُقام حفلة الحي يوم السبت 14 حزيران (يونيو) ابتداءً من الساعة الثالثة عصرًا في حديقة المجمّع السكني. يمكن لكل شخص أن يُحضر طبقًا أو مشروبًا. وفي حال هطول المطر، سنلتقي في القاعة المشتركة. يُرجى تأكيد حضوركم قبل يوم الأربعاء.',
          ar_syrian:
            'يا جيرانّا، حفلة الحارة رح تكون يوم السبت 14 حزيران من الساعة تلاتة العصر بجنينة البناية. كل واحد فيه يجيب طبخة أو شي يشربه. إذا نزل مطر، منتلاقى بالصالة المشتركة. ياريت تأكدولنا قبل الأربعا إذا جايين.',
          tr: 'Sevgili komşular, mahalle şenliği 14 Haziran Cumartesi günü saat 15.00’ten itibaren sitenin bahçesinde yapılacak. Herkes bir yemek ya da içecek getirebilir. Yağmur yağarsa ortak salonda buluşacağız. Lütfen katılımınızı çarşambaya kadar bildirin.',
          de: 'Liebe Nachbarinnen und Nachbarn, das Nachbarschaftsfest findet am Samstag, dem 14. Juni, ab 15 Uhr im Garten der Wohnanlage statt. Jeder kann ein Gericht oder ein Getränk mitbringen. Bei Regen treffen wir uns im Gemeinschaftsraum. Bitte gebt bis Mittwoch Bescheid, ob ihr kommt.',
          es: 'Queridos vecinos: la fiesta del barrio será el sábado 14 de junio a partir de las 15:00 en el jardín de la urbanización. Cada uno puede traer un plato o una bebida. Si llueve, nos reuniremos en la sala común. Por favor, confirmad vuestra asistencia antes del miércoles.',
        },
        summary: {
          short: {
            paragraph:
              'Fête de quartier le samedi 14 juin à 15 h au jardin (salle commune s’il pleut), réponse attendue avant mercredi.',
            points: [
              'Samedi 14 juin, 15 h, jardin de la résidence.',
              'Un plat ou une boisson par personne.',
              'Confirmation avant mercredi.',
            ],
          },
          medium: {
            paragraph:
              'Les voisins sont invités à la fête de quartier, le samedi 14 juin à partir de 15 h dans le jardin de la résidence. Chacun peut apporter un plat ou une boisson, et la fête se tient dans la salle commune en cas de pluie. Il faut confirmer sa présence avant mercredi.',
            points: [
              'Fête de quartier le samedi 14 juin, dès 15 h.',
              'Lieu : le jardin de la résidence.',
              'Chacun apporte un plat ou une boisson.',
              'Salle commune en cas de pluie.',
              'Confirmation avant mercredi.',
            ],
          },
          detailed: {
            paragraph:
              'Ce message invite les voisins à la fête de quartier, organisée le samedi 14 juin à partir de 15 h dans le jardin de la résidence. La participation est simple : chacun peut apporter un plat ou une boisson. Une solution est prévue en cas de pluie, puisque la fête aura alors lieu dans la salle commune. Chacun doit enfin confirmer sa présence avant mercredi.',
            points: [
              'Événement : la fête de quartier.',
              'Date et heure : samedi 14 juin, à partir de 15 h.',
              'Lieu : le jardin de la résidence.',
              'Participation : un plat ou une boisson par personne.',
              'Plan B : la salle commune en cas de pluie.',
              'À faire : confirmer sa présence avant mercredi.',
            ],
          },
        },
      },
    ],
    en: [
      {
        lang: 'en',
        text: 'Hi Sam, I wanted to let you know that the report wont be ready untill Thursday. The figures from the third quarter needs another check before we send them to the client. Their is also a small issue with the budget table, but I should fix it tomorrow morning.',
        correction:
          'Hi Sam, I wanted to let you know that the report won’t be ready until Thursday. The figures from the third quarter need another check before we send them to the client. There is also a small issue with the budget table, but I should fix it tomorrow morning.',
        rewrite: {
          professional:
            'Hi Sam, a quick update: the report will be ready on Thursday. The third-quarter figures need one more check before we send them to the client. There is also a minor issue in the budget table, which I expect to fix tomorrow morning.',
          formal:
            'Dear Sam, I am writing to inform you that the report will not be ready until Thursday. The third-quarter figures require further review before they are sent to the client. There is also a minor issue with the budget table, which I intend to resolve tomorrow morning.',
          friendly:
            'Hi Sam! Just a heads-up: the report won’t be ready until Thursday. The third-quarter figures need one more look before they go to the client. There’s also a small glitch in the budget table, but I should have it sorted tomorrow morning.',
          casual:
            'Hey Sam, the report won’t be done till Thursday. Q3 numbers need another check before they go to the client. Also a small thing in the budget table, I’ll fix it tomorrow morning.',
          polite:
            'Hi Sam, I just wanted to let you know that the report won’t be ready until Thursday. The third-quarter figures need another check before we send them to the client. There is also a small issue with the budget table, which I should be able to fix tomorrow morning. Thank you for your patience.',
          concise:
            'Sam, the report won’t be ready until Thursday: the Q3 figures need another check before going to the client. A small budget-table issue should be fixed tomorrow morning.',
          funny:
            'Hi Sam, the report has asked for a few more days and will show up on Thursday. The third-quarter figures want one more check before they meet the client. The budget table also has a tiny issue, but I’ll have a word with it tomorrow morning.',
          custom: [
            'Hi Sam, I wanted to let you know that the report won’t be ready until Thursday. The figures from the third quarter need another check before we send them to the client. There is also a small issue with the budget table, but I should fix it tomorrow morning.',
            'Hi Sam, just letting you know the report won’t be ready until Thursday. The third-quarter figures need another check before we send them to the client. There’s also a small issue with the budget table, but I should fix it tomorrow morning.',
            'Hi Sam, I wanted to let you know that the report will not be ready until Thursday. The third-quarter figures need another check before we send them to the client. There is also a small issue with the budget table, which I should fix tomorrow morning.',
            'Hi Sam, please note that the report will not be ready until Thursday. The third-quarter figures need a further check before we send them to the client. There is also a minor issue with the budget table, which I expect to resolve tomorrow morning.',
            'Dear Sam, please be advised that the report will not be completed until Thursday. The third-quarter figures require further verification prior to their transmission to the client. A minor issue has also been identified in the budget table; I anticipate resolving it tomorrow morning.',
          ],
        },
        translation: {
          fr: 'Bonjour Sam, je voulais te prévenir que le rapport ne sera pas prêt avant jeudi. Les chiffres du troisième trimestre doivent être vérifiés à nouveau avant d’être envoyés au client. Il y a aussi un petit problème dans le tableau du budget, mais je devrais le corriger demain matin.',
          ar_msa:
            'مرحبًا سام، أردتُ أن أخبرك بأن التقرير لن يكون جاهزًا قبل يوم الخميس. تحتاج أرقام الربع الثالث إلى مراجعة أخرى قبل إرسالها إلى العميل. هناك أيضًا مشكلة صغيرة في جدول الميزانية، لكنني سأصلحها على الأرجح صباح الغد.',
          ar_syrian:
            'أهلين سام، حبيت قلك إنو التقرير ما رح يجهز قبل الخميس. أرقام الربع التالت بدها مراجعة كمان مرة قبل ما نبعتها للزبون. وفي كمان مشكلة صغيرة بجدول الميزانية، بس إن شاء الله بصلحها بكرا الصبح.',
          tr: 'Merhaba Sam, raporun perşembeden önce hazır olmayacağını haber vermek istedim. Üçüncü çeyrek rakamlarının müşteriye gönderilmeden önce bir kez daha kontrol edilmesi gerekiyor. Bütçe tablosunda da küçük bir sorun var ama yarın sabah düzeltmiş olurum.',
          de: 'Hallo Sam, ich wollte dir Bescheid geben, dass der Bericht erst am Donnerstag fertig wird. Die Zahlen aus dem dritten Quartal müssen noch einmal geprüft werden, bevor wir sie an den Kunden schicken. In der Budgettabelle gibt es außerdem ein kleines Problem, das ich morgen früh beheben dürfte.',
          es: 'Hola, Sam: quería avisarte de que el informe no estará listo hasta el jueves. Las cifras del tercer trimestre necesitan otra revisión antes de enviarlas al cliente. También hay un pequeño problema en la tabla del presupuesto, pero debería solucionarlo mañana por la mañana.',
        },
        summary: {
          short: {
            paragraph:
              'The report is delayed until Thursday while the Q3 figures are rechecked and a budget-table issue is fixed.',
            points: [
              'Report ready on Thursday, not before.',
              'Q3 figures need another check.',
              'Budget-table fix expected tomorrow morning.',
            ],
          },
          medium: {
            paragraph:
              'The report will not be ready until Thursday. The third-quarter figures need another check before they go to the client, and a small issue in the budget table should be fixed tomorrow morning.',
            points: [
              'The report is delayed until Thursday.',
              'Third-quarter figures need another check.',
              'They will then be sent to the client.',
              'A small budget-table issue should be fixed tomorrow morning.',
            ],
          },
          detailed: {
            paragraph:
              'Sam is told that the report will not be ready until Thursday. Before anything goes to the client, the third-quarter figures need one more check. The message also mentions a small issue with the budget table, which should be fixed tomorrow morning.',
            points: [
              'Recipient: Sam.',
              'Delay: the report will be ready on Thursday.',
              'Reason: the third-quarter figures need another check.',
              'Next step: send the figures to the client after the check.',
              'Open issue: a small problem in the budget table.',
              'Expected fix: tomorrow morning.',
            ],
          },
        },
      },
      {
        lang: 'en',
        text: 'Dear neighbours, the street party will take place on Saturday 14 June from 3 pm in the garden behind the building. Everyone are welcome to bring a dish or a drink. If it rains, we will meet in the common room instead. Please confirm weather you can come by Wednesday.',
        correction:
          'Dear neighbours, the street party will take place on Saturday 14 June from 3 pm in the garden behind the building. Everyone is welcome to bring a dish or a drink. If it rains, we will meet in the common room instead. Please confirm whether you can come by Wednesday.',
        rewrite: {
          professional:
            'Dear neighbours, the street party will be held on Saturday 14 June from 3 pm in the garden behind the building. You are welcome to bring a dish or a drink. In case of rain, it will move to the common room. Please let us know by Wednesday whether you can attend.',
          formal:
            'Dear neighbours, we are pleased to invite you to the street party, which will be held on Saturday 14 June from 3 pm in the garden behind the building. Guests are welcome to bring a dish or a beverage. Should it rain, the event will take place in the common room. Kindly confirm your attendance by Wednesday.',
          friendly:
            'Hi everyone! The street party is on Saturday 14 June from 3 pm, in the garden behind the building. Bring a dish or a drink to share. If it rains, we’ll gather in the common room instead. Let us know by Wednesday if you can make it!',
          casual:
            'Hey neighbours, street party Saturday 14 June from 3 pm, in the garden out back. Bring some food or drinks. If it rains, we’ll move to the common room. Let us know by Wednesday if you’re coming.',
          polite:
            'Dear neighbours, we would be delighted to see you at the street party on Saturday 14 June from 3 pm in the garden behind the building. If you wish, you are welcome to bring a dish or a drink. Should it rain, we will meet in the common room instead. We would be grateful if you could confirm by Wednesday.',
          concise:
            'Street party: Saturday 14 June, 3 pm, garden behind the building (common room if it rains). Bring a dish or a drink. Please confirm by Wednesday.',
          funny:
            'Dear neighbours, the street party lands on Saturday 14 June at 3 pm in the garden behind the building. Bring a dish or a drink: empty hands are allowed, empty plates are not. If the sky has other plans, we’ll retreat to the common room. Please confirm by Wednesday so we can count the chairs.',
          custom: [
            'Dear neighbours, the street party will take place on Saturday 14 June from 3 pm in the garden behind the building. Everyone is welcome to bring a dish or a drink. If it rains, we will meet in the common room instead. Please confirm whether you can come by Wednesday.',
            'Dear neighbours, the street party is on Saturday 14 June from 3 pm in the garden behind the building. Everyone is welcome to bring a dish or a drink. If it rains, we’ll meet in the common room instead. Please let us know by Wednesday whether you can come.',
            'Dear neighbours, the street party will take place on Saturday 14 June from 3 pm in the garden behind the building. Everyone is welcome to bring a dish or a drink. If it rains, we will meet in the common room instead. Please confirm by Wednesday whether you can come.',
            'Dear neighbours, the street party will be held on Saturday 14 June from 3 pm in the garden behind the building. Everyone is welcome to bring a dish or a drink. In the event of rain, we will gather in the common room. Please confirm by Wednesday whether you will attend.',
            'Dear neighbours, we have the pleasure of inviting you to the street party, to be held on Saturday 14 June from 3 pm in the garden behind the building. Each guest is cordially invited to bring a dish or a beverage. In the event of inclement weather, the gathering will take place in the common room. We would be most grateful if you would confirm your attendance by Wednesday.',
          ],
        },
        translation: {
          fr: 'Chers voisins, la fête de rue aura lieu le samedi 14 juin à partir de 15 h dans le jardin derrière l’immeuble. Chacun est invité à apporter un plat ou une boisson. S’il pleut, nous nous retrouverons dans la salle commune. Merci de confirmer avant mercredi si vous pouvez venir.',
          ar_msa:
            'جيراننا الأعزاء، ستُقام حفلة الشارع يوم السبت 14 حزيران (يونيو) ابتداءً من الساعة الثالثة عصرًا في الحديقة خلف المبنى. الجميع مدعوون لإحضار طبق أو مشروب. وإذا هطل المطر، فسنلتقي في القاعة المشتركة بدلًا من ذلك. يُرجى تأكيد إمكانية حضوركم قبل يوم الأربعاء.',
          ar_syrian:
            'يا جيرانّا، حفلة الحارة يوم السبت 14 حزيران من الساعة تلاتة العصر بالجنينة اللي ورا البناية. أهلا وسهلا بالكل، وكل واحد فيه يجيب أكلة أو شي يشربه. إذا نزل مطر، منتلاقى بالصالة المشتركة. ياريت تقولولنا قبل الأربعا إذا فيكن تجوا.',
          tr: 'Sevgili komşular, sokak şenliği 14 Haziran Cumartesi günü saat 15.00’ten itibaren binanın arkasındaki bahçede yapılacak. Herkes bir yemek ya da içecek getirebilir. Yağmur yağarsa onun yerine ortak salonda buluşacağız. Lütfen gelip gelemeyeceğinizi çarşambaya kadar bildirin.',
          de: 'Liebe Nachbarinnen und Nachbarn, das Straßenfest findet am Samstag, dem 14. Juni, ab 15 Uhr im Garten hinter dem Haus statt. Alle sind herzlich eingeladen, ein Gericht oder ein Getränk mitzubringen. Falls es regnet, treffen wir uns stattdessen im Gemeinschaftsraum. Bitte sagt bis Mittwoch Bescheid, ob ihr kommen könnt.',
          es: 'Queridos vecinos: la fiesta de la calle será el sábado 14 de junio a partir de las 15:00 en el jardín detrás del edificio. Todos podéis traer un plato o una bebida. Si llueve, nos veremos en la sala común. Por favor, confirmad antes del miércoles si podéis venir.',
        },
        summary: {
          short: {
            paragraph:
              'Street party on Saturday 14 June at 3 pm in the garden (common room if it rains); reply by Wednesday.',
            points: [
              'Saturday 14 June, 3 pm, garden behind the building.',
              'Bring a dish or a drink.',
              'Confirm by Wednesday.',
            ],
          },
          medium: {
            paragraph:
              'Neighbours are invited to a street party on Saturday 14 June from 3 pm in the garden behind the building. Everyone can bring a dish or a drink, and the party moves to the common room if it rains. Replies are due by Wednesday.',
            points: [
              'Street party on Saturday 14 June, from 3 pm.',
              'Venue: the garden behind the building.',
              'Bring a dish or a drink.',
              'Common room if it rains.',
              'Confirm by Wednesday.',
            ],
          },
          detailed: {
            paragraph:
              'This message invites the neighbours to a street party on Saturday 14 June, starting at 3 pm in the garden behind the building. Taking part is simple: everyone is welcome to bring a dish or a drink. There is a plan for bad weather, as the party moves to the common room if it rains. Finally, everyone is asked to confirm by Wednesday whether they can come.',
            points: [
              'Event: the street party.',
              'Date and time: Saturday 14 June, from 3 pm.',
              'Venue: the garden behind the building.',
              'Contribution: a dish or a drink each.',
              'Plan B: the common room if it rains.',
              'To do: confirm by Wednesday.',
            ],
          },
        },
      },
    ],
  };

  const BULLET = '• ';

  const STYLE_IDS = [
    'professional',
    'formal',
    'friendly',
    'casual',
    'polite',
    'concise',
    'funny',
    'custom',
  ];

  const TARGETS = ['fr', 'en', 'ar', 'tr', 'de', 'es'];

  const LENGTHS = ['short', 'medium', 'detailed'];

  const FORMATS = ['paragraph', 'points'];

  Object.assign((window.CorrectlyData ||= {}), {
    DEMO,
    BULLET,
    STYLE_IDS,
    TARGETS,
    LENGTHS,
    FORMATS,
  });
})();
