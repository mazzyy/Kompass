// Invented names typical of the client nationalities. SYNTHETIC: not real people.
export interface Origin {
  land: string;
  langs: string[];
  latinNative: boolean;
  m: string[];
  f: string[];
  last: string[];
  weight: number;
}

export const ORIGINS: Origin[] = [
  {
    land: 'Eritrea', langs: ['Tigrinya'], latinNative: false, weight: 22,
    m: ['Yonas', 'Filmon', 'Robel', 'Dawit', 'Samuel', 'Habtom', 'Mehari', 'Tesfalem', 'Biniam', 'Aron', 'Kibrom', 'Natnael'],
    f: ['Amina', 'Selam', 'Helen', 'Rahel', 'Saba', 'Lidia', 'Senait', 'Mebrat', 'Yordanos', 'Hiwet', 'Feven', 'Ruta'],
    last: ['Tesfay', 'Ghebremariam', 'Haile', 'Kidane', 'Tekle', 'Berhane', 'Weldu', 'Asmerom', 'Gebru', 'Mehari', 'Yohannes', 'Habte'],
  },
  {
    land: 'Afghanistan', langs: ['Dari', 'Paschtu'], latinNative: false, weight: 20,
    m: ['Mohammad', 'Ahmad', 'Ali', 'Mustafa', 'Hamid', 'Jawad', 'Farid', 'Nasir', 'Sami', 'Omid', 'Karim', 'Rahim'],
    f: ['Fatima', 'Zahra', 'Maryam', 'Nargis', 'Shabnam', 'Parwana', 'Laila', 'Sima', 'Hadia', 'Mina', 'Sakina', 'Tamana'],
    last: ['Ahmadi', 'Rahimi', 'Hosseini', 'Sultani', 'Karimi', 'Noori', 'Haidari', 'Sadat', 'Amiri', 'Azizi', 'Wardak', 'Popal'],
  },
  {
    land: 'Syrien', langs: ['Arabisch', 'Kurdisch'], latinNative: false, weight: 13,
    m: ['Omar', 'Khaled', 'Yousef', 'Ibrahim', 'Hassan', 'Mahmoud', 'Bilal', 'Firas', 'Tarek', 'Rami'],
    f: ['Rana', 'Lina', 'Hiba', 'Nour', 'Rasha', 'Dima', 'Huda', 'Salma', 'Reem', 'Aya'],
    last: ['Al-Hamad', 'Haddad', 'Khalil', 'Darwish', 'Mansour', 'Ibrahim', 'Saleh', 'Hussein', 'Othman', 'Najjar'],
  },
  {
    land: 'Türkei', langs: ['Kurdisch', 'Türkisch'], latinNative: true, weight: 9,
    m: ['Mehmet', 'Ahmet', 'Serhat', 'Baran', 'Deniz', 'Zana', 'Rojhat', 'Murat'],
    f: ['Zeynep', 'Elif', 'Rojda', 'Berivan', 'Ayse', 'Dilan', 'Gulistan', 'Nesrin'],
    last: ['Yilmaz', 'Demir', 'Kaya', 'Aslan', 'Celik', 'Dogan', 'Ozturk', 'Kurt'],
  },
  {
    land: 'Somalia', langs: ['Somali'], latinNative: true, weight: 7,
    m: ['Abdi', 'Abdullahi', 'Hassan', 'Mohamed', 'Yusuf', 'Ahmed', 'Bashir', 'Liban'],
    f: ['Hodan', 'Ayan', 'Faduma', 'Halimo', 'Sahra', 'Ifrah', 'Asha', 'Ubah'],
    last: ['Warsame', 'Farah', 'Abdi', 'Hirsi', 'Jama', 'Ali', 'Osman', 'Nur'],
  },
  {
    land: 'Iran', langs: ['Farsi'], latinNative: false, weight: 6,
    m: ['Reza', 'Amir', 'Saeed', 'Behnam', 'Navid', 'Arash', 'Payam'],
    f: ['Shirin', 'Mahsa', 'Neda', 'Leila', 'Parisa', 'Yasmin', 'Sara'],
    last: ['Hosseini', 'Moradi', 'Jafari', 'Karimi', 'Rostami', 'Ebrahimi', 'Tehrani'],
  },
  {
    land: 'Sri Lanka', langs: ['Tamil'], latinNative: false, weight: 5,
    m: ['Tharshan', 'Kajan', 'Sutharsan', 'Nirojan', 'Prasanth'],
    f: ['Tharani', 'Kowsalya', 'Nirosha', 'Sharmila', 'Vithya'],
    last: ['Sivakumar', 'Thambirajah', 'Nadarajah', 'Kanagaratnam', 'Selvarajah'],
  },
  {
    land: 'Irak', langs: ['Arabisch', 'Kurdisch'], latinNative: false, weight: 5,
    m: ['Haider', 'Ammar', 'Mustafa', 'Karwan', 'Dilshad', 'Sarmad'],
    f: ['Zainab', 'Shilan', 'Noor', 'Avan', 'Rozhin', 'Sara'],
    last: ['Al-Jabouri', 'Kareem', 'Rashid', 'Barzani', 'Mahmood', 'Hamid'],
  },
  {
    land: 'Äthiopien', langs: ['Amharisch'], latinNative: false, weight: 4,
    m: ['Dawit', 'Abebe', 'Tewodros', 'Yared', 'Henok'],
    f: ['Tigist', 'Meron', 'Bethlehem', 'Hanna', 'Selamawit'],
    last: ['Bekele', 'Tadesse', 'Girma', 'Alemu', 'Wolde'],
  },
  {
    land: 'Ukraine', langs: ['Ukrainisch'], latinNative: false, weight: 9,
    m: ['Oleksandr', 'Andrii', 'Dmytro', 'Serhii', 'Mykola', 'Ivan'],
    f: ['Olena', 'Iryna', 'Natalia', 'Kateryna', 'Oksana', 'Yulia'],
    last: ['Kovalenko', 'Shevchenko', 'Bondarenko', 'Tkachenko', 'Melnyk', 'Kravchenko'],
  },
];

export const EMPLOYERS = [
  ['Alpha-Home GmbH', 'Gümmenen'],
  ['Alrobe Immobilien AG', 'Gwatt'],
  ['Alters- und Pflegeheim Wattenwil', 'Heiligenschwendi'],
  ['Altersbetreuung Worb', 'Worb'],
  ['Altersresidenz zur Wiese', 'Heiligenschwendi'],
  ['Alterswohngemeinschaft Vier Jahreszeiten', 'Heimberg'],
  ['Adecco', 'Bern'],
  ['4 You Personal AG', 'Lenzburg'],
  ['Gastro Aare GmbH', 'Bern'],
  ['Restaurant Zytglogge AG', 'Bern'],
  ['Hotel Bärengraben AG', 'Bern'],
  ['Reinigungsdienst Blitzblank GmbH', 'Ostermundigen'],
  ['Transmed Logistik AG', 'Härkingen'],
  ['Bäckerei Hubschmid AG', 'Köniz'],
  ['Spital Tiefenau Gastronomie', 'Bern'],
  ['Gärtnerei Wyss AG', 'Zollikofen'],
  ['Bauunternehmung Marti & Co. AG', 'Bern'],
  ['Migros-Genossenschafts-Bund Verteilzentrum', 'Schönbühl'],
  ['Coop Genossenschaft', 'Bern'],
  ['Wäscherei Bernstrasse GmbH', 'Liebefeld'],
  ['Kita Sonnenschein', 'Bern'],
  ['Spitex Bern', 'Bern'],
  ['Hauswartung Eggimann GmbH', 'Wabern'],
  ['Velokurier Bern GmbH', 'Bern'],
];

export const PROGRAMS = [
  ['Kompetenzzentrum Arbeit', 'Bern', 'Beschäftigungsprogramm'],
  ['Arbeitsintegration Bern-Mittelland', 'Bern', 'Arbeitsintegration Einsatzplatz'],
  ['Brocki Bern', 'Bern', 'Praktikum'],
];

export const ZIVIL = ['ledig', 'verheiratet', 'geschieden', 'verwitwet'];
export const AUSBILDUNG = ['keine', 'obligatorische Schule', 'Berufslehre', 'Mittelschule', 'Universität / Hochschule'];
export const ORTE = ['3008 Bern', '3027 Bern', '3018 Bern', '3014 Bern', '3006 Bern', '3013 Bern', '3097 Liebefeld', '3084 Wabern'];
export const UNTERBRINGUNG = ['Kollektivunterkunft', 'Wohnung (eigene)', 'Wohnung (vermittelt)', 'WG / Untermiete'];
export const SOCIAL_WORKERS: [string, number][] = [
  ['S. Keller', 0.24],
  ['M. Rossi', 0.28],
  ['L. Bühler', 0.24],
  ['D. Meier', 0.24],
];
export const CAREERS = ['Pflege (FaGe)', 'Gastronomie', 'Logistik', 'Reinigung', 'Detailhandel', 'Textil / Schneiderei', 'Bau', 'Kinderbetreuung', 'Informatik', 'Coiffeur', 'Landwirtschaft', 'Transport / Chauffeur'];
