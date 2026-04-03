'use strict';

/* ============================================================
   ===== DATA: IELTS TEST CONTENT =====
   ============================================================ */
const READING_DATA = {
  passages: [
    {
      id: 'p1',
      title: 'The Rise of Urban Farming',
      text: `<p>In cities around the world, a quiet revolution is taking root — quite literally. Urban farming, once considered a fringe movement, has grown into a significant force reshaping the way people think about food production. From rooftop gardens in New York to vertical farms in Singapore, growing food in the city is no longer a novelty but a necessity for many communities.</p>
      <p>The reasons behind this trend are manifold. Rapid urbanisation has led to what some researchers call "food deserts" — urban neighbourhoods where access to fresh, affordable produce is severely limited. In such areas, corner shops and fast-food outlets dominate, leaving residents with few healthy options. Urban farms provide a direct solution by bringing food production closer to the people who need it most.</p>
      <p>Environmental concerns also play a major role. Conventional agriculture relies heavily on fossil fuels for transportation, refrigeration, and the production of chemical fertilisers. By contrast, urban farms reduce food miles — the distance food travels from farm to plate — and many use organic or low-input methods. Some advanced urban farms even recover rainwater for irrigation and use solar panels for energy, making them nearly self-sufficient.</p>
      <p>Technology is accelerating the urban farming movement. Hydroponic systems, which grow plants in nutrient-rich water rather than soil, allow crops to be grown in warehouses, car parks, and even underground tunnels. LED lighting technology makes it possible to grow crops year-round regardless of season or climate. Startups around the world are experimenting with artificial intelligence to monitor plant health, optimise growing conditions, and reduce waste.</p>
      <p>Community engagement is another hallmark of the urban farming movement. Many projects are run as cooperatives or community gardens, giving urban residents a chance to reconnect with nature, learn practical skills, and foster social ties. Schools have embraced the concept too, using gardens as outdoor classrooms to teach children about biology, nutrition, and environmental stewardship.</p>
      <p>Despite these benefits, urban farming faces real challenges. Land in cities is expensive and often contaminated with heavy metals from decades of industrial activity. Zoning laws in many cities were not written with farming in mind, creating legal obstacles for would-be growers. And while urban farms can supplement the food supply, critics point out that they are unlikely to replace conventional agriculture on a large scale given the sheer volume of food that cities require.</p>`,
      questions: [
        // True/False/Not Given (Q1–6)
        { id: 1, type: 'tfng', text: 'Urban farming is now commonly practised in major cities worldwide.', answer: 'TRUE' },
        { id: 2, type: 'tfng', text: 'Food deserts are areas in rural regions where fresh produce is unavailable.', answer: 'FALSE' },
        { id: 3, type: 'tfng', text: 'Urban farms always use organic farming methods exclusively.', answer: 'FALSE' },
        { id: 4, type: 'tfng', text: 'Hydroponic systems do not require soil to grow plants.', answer: 'TRUE' },
        { id: 5, type: 'tfng', text: 'Urban farming projects have been integrated into some school curricula.', answer: 'TRUE' },
        { id: 6, type: 'tfng', text: 'Urban farming is expected to completely replace conventional agriculture within two decades.', answer: 'FALSE' },
        // Multiple Choice (Q7–13)
        { id: 7, type: 'mcq', text: 'What is described as a primary driver of urban farming growth?', options: ['A. Government subsidies for city farmers', 'B. Limited access to fresh food in urban areas', 'C. The decline of rural agriculture', 'D. High demand for organic produce globally'], answer: 'B' },
        { id: 8, type: 'mcq', text: 'Which environmental benefit of urban farming is mentioned in the passage?', options: ['A. Reduced water consumption globally', 'B. Elimination of chemical fertilisers', 'C. Reduction in food transportation distances', 'D. Lower global carbon emissions overall'], answer: 'C' },
        { id: 9, type: 'mcq', text: 'The word "manifold" in paragraph 2 most closely means:', options: ['A. unclear', 'B. numerous and varied', 'C. surprising', 'D. well-documented'], answer: 'B' },
        { id: 10, type: 'mcq', text: 'How does technology contribute to urban farming according to the passage?', options: ['A. By replacing human workers entirely', 'B. By enabling year-round crop growth indoors', 'C. By reducing water use by 90%', 'D. By providing cheaper land for farmers'], answer: 'B' },
        { id: 11, type: 'mcq', text: 'What social benefit of urban farming is highlighted?', options: ['A. It creates large numbers of paid jobs', 'B. It reduces urban crime rates', 'C. It helps communities connect and learn skills', 'D. It lowers housing costs near farms'], answer: 'C' },
        { id: 12, type: 'mcq', text: 'Which challenge facing urban farming is NOT mentioned in the passage?', options: ['A. Contaminated urban land', 'B. Lack of consumer interest', 'C. High cost of city real estate', 'D. Restrictive zoning laws'], answer: 'B' },
        { id: 13, type: 'mcq', text: 'What is the writer\'s overall attitude toward urban farming?', options: ['A. Strongly critical of its environmental claims', 'B. Balanced — acknowledging benefits and limitations', 'C. Enthusiastically supportive with no reservations', 'D. Sceptical about its community benefits'], answer: 'B' },
      ]
    },
    {
      id: 'p2',
      title: 'The Science of Sleep',
      text: `<p><strong>A</strong> — Sleep is one of the most universal yet least understood biological processes. Every animal with a nervous system sleeps, from the humble fruit fly to the blue whale. Yet despite decades of research, scientists are still unravelling why sleep is so essential — and what happens when we don't get enough of it.</p>
      <p><strong>B</strong> — During sleep, the brain is far from inactive. In fact, it cycles through distinct stages: light non-REM sleep, deep slow-wave sleep, and rapid eye movement (REM) sleep. Each stage serves a different purpose. Slow-wave sleep is associated with physical restoration — the body repairs tissues, produces hormones, and consolidates the immune system. REM sleep, by contrast, plays a crucial role in emotional processing and memory consolidation.</p>
      <p><strong>C</strong> — Memory consolidation during sleep has been one of the field's most exciting discoveries. Researchers at Harvard Medical School found that students who slept between learning and testing sessions recalled information significantly better than those who remained awake. The brain appears to replay and reinforce memories during sleep, essentially "saving" what was learned during the day.</p>
      <p><strong>D</strong> — The consequences of sleep deprivation extend far beyond tiredness. Studies show that sleeping fewer than six hours a night is associated with increased risks of obesity, type 2 diabetes, cardiovascular disease, and even certain cancers. The immune system takes a particular hit — one study found that people who slept six hours or less were four times more likely to catch a cold than those who slept seven or more hours.</p>
      <p><strong>E</strong> — Teenagers face a unique sleep challenge. Research shows that adolescent brains are biologically programmed to fall asleep later and wake later — a phenomenon called "sleep phase delay." Yet school start times often force teenagers to rise early, creating a chronic mismatch between biological clock and social schedule. Several countries have experimented with later school start times, with promising results for both academic performance and mental health.</p>
      <p><strong>F</strong> — Modern technology poses a growing threat to healthy sleep. The blue light emitted by smartphones and tablets suppresses the production of melatonin, the hormone that signals bedtime to the brain. Using devices before bed has been shown to delay sleep onset by up to an hour. Sleep experts recommend a "digital sunset" — avoiding screens for at least an hour before attempting to sleep.</p>`,
      questions: [
        // Matching Headings (Q14–20)
        { id: 14, type: 'matching', text: 'Which paragraph discusses the health consequences of insufficient sleep?', options: ['A', 'B', 'C', 'D', 'E', 'F'], answer: 'D' },
        { id: 15, type: 'matching', text: 'Which paragraph explains how technology disrupts sleep?', options: ['A', 'B', 'C', 'D', 'E', 'F'], answer: 'F' },
        { id: 16, type: 'matching', text: 'Which paragraph introduces sleep as a universal but poorly understood phenomenon?', options: ['A', 'B', 'C', 'D', 'E', 'F'], answer: 'A' },
        { id: 17, type: 'matching', text: 'Which paragraph describes research showing sleep improves memory retention?', options: ['A', 'B', 'C', 'D', 'E', 'F'], answer: 'C' },
        { id: 18, type: 'matching', text: 'Which paragraph discusses why adolescents struggle with early school hours?', options: ['A', 'B', 'C', 'D', 'E', 'F'], answer: 'E' },
        { id: 19, type: 'matching', text: 'Which paragraph outlines the different functions of sleep stages?', options: ['A', 'B', 'C', 'D', 'E', 'F'], answer: 'B' },
        // Sentence Completion (Q20–26)
        { id: 20, type: 'short', text: 'Slow-wave sleep helps the body repair tissues and consolidate the ________.', answer: 'immune system' },
        { id: 21, type: 'short', text: 'Harvard researchers found that students who ________ between learning and testing remembered information better.', answer: 'slept' },
        { id: 22, type: 'short', text: 'Sleeping fewer than six hours increases the risk of obesity, diabetes, and ________ disease.', answer: 'cardiovascular' },
        { id: 23, type: 'short', text: 'The tendency for teenagers to fall asleep and wake up later is called sleep phase ________.', answer: 'delay' },
        { id: 24, type: 'short', text: 'Blue light from devices suppresses the production of ________, disrupting sleep.', answer: 'melatonin' },
        { id: 25, type: 'short', text: 'Sleep experts recommend avoiding screens for at least ________ hour before sleeping.', answer: 'one' },
        { id: 26, type: 'short', text: 'During REM sleep, the brain plays a crucial role in emotional processing and memory ________.', answer: 'consolidation' },
      ]
    },
    {
      id: 'p3',
      title: 'Artificial Intelligence in Healthcare',
      text: `<p>Artificial intelligence is transforming healthcare with a speed and scope that few predicted a decade ago. From diagnosing diseases to personalising treatment plans, AI systems are beginning to match — and in some cases surpass — human specialists in specific clinical tasks. Yet the technology also raises profound questions about accountability, privacy, and the future role of human clinicians.</p>
      <p>In medical imaging, AI has demonstrated remarkable capabilities. Deep learning algorithms trained on millions of X-rays, MRI scans, and retinal photographs can detect cancers, diabetic retinopathy, and neurological conditions with accuracy rates comparable to experienced radiologists. A 2019 study published in Nature found that an AI system outperformed six radiologists in detecting breast cancer from mammograms, reducing both false positives and false negatives.</p>
      <p>Drug discovery is another frontier. Developing a new drug traditionally takes 10–15 years and costs over a billion dollars, with a high failure rate. AI platforms can analyse vast databases of molecular structures and predict which compounds are most likely to be effective, slashing both time and cost. During the COVID-19 pandemic, AI tools helped researchers identify promising antiviral candidates within weeks rather than years.</p>
      <p>Personalised medicine — tailoring treatment to the individual — is perhaps AI's most transformative potential. By analysing a patient's genetic profile, lifestyle data, and medical history, AI can suggest treatments most likely to be effective while minimising side effects. This approach contrasts sharply with traditional medicine's "one-size-fits-all" protocols.</p>
      <p>However, significant challenges remain. AI systems are only as good as the data they are trained on, and healthcare data is often biased — reflecting the demographics of historical patient populations rather than the full diversity of human beings. Studies have found that some AI diagnostic tools perform significantly worse for patients from ethnic minorities or non-Western countries simply because such populations were underrepresented in training datasets.</p>
      <p>Questions of accountability are equally thorny. When an AI system makes a diagnostic error, who is responsible — the developer, the hospital, or the clinician who relied on the system? Regulators worldwide are still developing frameworks to address this. In the European Union, proposed legislation requires that AI systems used in high-risk applications — including medicine — be transparent, auditable, and subject to human oversight.</p>
      <p>Despite these concerns, most healthcare professionals see AI as a powerful complement to human expertise rather than a replacement for it. The most likely future is a collaborative one, in which AI handles time-consuming data processing and pattern recognition, freeing clinicians to focus on what humans do best: empathy, ethical reasoning, and complex patient communication.</p>`,
      questions: [
        // Multiple Choice (Q27–33)
        { id: 27, type: 'mcq', text: 'What did the 2019 Nature study about AI and mammograms find?', options: ['A. AI was less accurate than the best radiologist', 'B. AI outperformed six radiologists in detecting breast cancer', 'C. AI doubled the rate of false positives', 'D. AI worked best for elderly patients'], answer: 'B' },
        { id: 28, type: 'mcq', text: 'Approximately how long does traditional drug development typically take?', options: ['A. 2–5 years', 'B. 5–8 years', 'C. 10–15 years', 'D. 20–25 years'], answer: 'C' },
        { id: 29, type: 'mcq', text: 'What is "personalised medicine" as described in the passage?', options: ['A. Providing doctors with personal AI assistants', 'B. Tailoring treatment to the individual patient\'s profile', 'C. Giving patients access to their own medical records', 'D. Training AI on personal data from social media'], answer: 'B' },
        { id: 30, type: 'mcq', text: 'Why do some AI diagnostic tools perform poorly for minority patients?', options: ['A. Minority patients have different diseases', 'B. Developers deliberately excluded such patients', 'C. These populations were underrepresented in training data', 'D. Minority patients are less likely to use technology'], answer: 'C' },
        { id: 31, type: 'mcq', text: 'What does EU proposed legislation require for high-risk AI systems?', options: ['A. They must be built only by government agencies', 'B. They must be transparent, auditable, and subject to human oversight', 'C. They must be tested exclusively on European patients', 'D. They must not replace any human jobs'], answer: 'B' },
        { id: 32, type: 'mcq', text: 'The phrase "one-size-fits-all" in paragraph 4 suggests that traditional medicine:', options: ['A. is expensive for all patients equally', 'B. applies the same protocols to different patients', 'C. ignores the role of genetics', 'D. uses AI to standardise diagnoses'], answer: 'B' },
        { id: 33, type: 'mcq', text: 'What is the writer\'s view on the future relationship between AI and clinicians?', options: ['A. AI will soon replace most medical specialists', 'B. AI and humans will work collaboratively', 'C. Clinicians should resist using AI tools', 'D. AI will eliminate medical errors entirely'], answer: 'B' },
        // Short Answer (Q34–40)
        { id: 34, type: 'short', text: 'Name ONE condition mentioned that AI can detect from medical images.', answer: 'cancer / diabetic retinopathy / neurological conditions' },
        { id: 35, type: 'short', text: 'How much does traditional drug development typically cost?', answer: 'over a billion dollars' },
        { id: 36, type: 'short', text: 'During which event did AI help identify antiviral drug candidates quickly?', answer: 'COVID-19 pandemic' },
        { id: 37, type: 'short', text: 'What three types of data can AI analyse to personalise treatment?', answer: 'genetic profile, lifestyle data, medical history' },
        { id: 38, type: 'short', text: 'What is the main reason AI tools may be biased against some patient groups?', answer: 'biased / unrepresentative training data' },
        { id: 39, type: 'short', text: 'Which region has proposed legislation requiring human oversight of high-risk AI?', answer: 'European Union / EU' },
        { id: 40, type: 'short', text: 'According to the final paragraph, what human skill do AI systems complement rather than replace?', answer: 'empathy / ethical reasoning / patient communication' },
      ]
    }
  ]
};

const WRITING_DATA = {
  task1: {
    prompt: 'The bar chart below shows the average energy consumption per person per year (in gigajoules) for six countries in 2020.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.',
    chartDescription: '📊 Chart data: Canada (235 GJ), Australia (198 GJ), USA (280 GJ), UK (142 GJ), Japan (158 GJ), Brazil (65 GJ)',
    minWords: 150,
    rubric: [
      'I described the overall trend or main feature',
      'I mentioned the highest and lowest values',
      'I made at least one comparison between countries',
      'I used appropriate data language (e.g., approximately, significantly)',
      'I did not give personal opinions about the data'
    ]
  },
  task2: {
    prompt: 'Some people believe that universities should focus on providing students with academic knowledge. Others think they should prepare students for the world of employment.\n\nDiscuss both views and give your own opinion.\n\nWrite at least 250 words.',
    minWords: 250,
    rubric: [
      'I clearly discussed BOTH views before giving my opinion',
      'I gave a clear personal opinion',
      'Each body paragraph has one main idea with support',
      'I used a variety of linking words and cohesive devices',
      'I used a range of vocabulary and avoided repetition',
      'I checked my grammar for complex sentences and tense consistency'
    ]
  }
};

const LISTENING_DATA = {
  sections: [
    {
      id: 's1',
      title: 'Part 1: Transport Survey',
      audioUrl: 'Resources/Cam18/Cam18_Audio/IELTS18_test1_audio1.mp3',
      transcript: `<strong>MAN:</strong> Excuse me. Would you mind if I asked you some questions? We're doing a survey on transport.<br>
<strong>SADIE:</strong> Yes, that's OK.<br>
<strong>MAN:</strong> First of all, can I take your name?<br>
<strong>SADIE:</strong> Yes. It's Sadie Jones.<br>
<strong>MAN:</strong> Thanks very much. And could I have your date of birth – just the year will do, actually.<br>
<strong>SADIE:</strong> Yes, that's fine. It's 1991.<br>
<strong>MAN:</strong> So next your postcode, please.<br>
<strong>SADIE:</strong> It's DW30 7YZ.<br>
<strong>MAN:</strong> Great. Thanks. Is that in Wells?<br>
<strong>SADIE:</strong> No it's actually in Harborne – Wells isn't far from there, though.<br>
<strong>MAN:</strong> Right, so now I want to ask you some questions about how you travelled here today. Did you use public transport?<br>
<strong>SADIE:</strong> Yes. I came by bus.<br>
<strong>MAN:</strong> OK. And that was today. It's the 24th of April, isn't it?<br>
<strong>SADIE:</strong> Isn't it the 25th? No, actually, you're right.<br>
<strong>MAN:</strong> And what was the reason for your trip today? I can see you've got some shopping with you.<br>
<strong>SADIE:</strong> Yes. I did some shopping but the main reason I came here was to go to the dentist.<br>
<strong>MAN:</strong> Good. Do you normally travel by bus into the city centre?<br>
<strong>SADIE:</strong> Yes. I stopped driving in ages ago because parking was so difficult to find and it costs so much.<br>
<strong>MAN:</strong> The bus is much more convenient too. It only takes about 30 minutes. So where did you start your journey?<br>
<strong>SADIE:</strong> At the bus stop on Claxby Street.<br>
<strong>MAN:</strong> Is that C-L-A-X-B-Y?<br>
<strong>SADIE:</strong> That's right.<br>
<strong>MAN:</strong> And how satisfied with the service are you? Do you have any complaints?<br>
<strong>SADIE:</strong> Well, it's very convenient but this morning it was late. Only about 10 minutes, but still.<br>
<strong>MAN:</strong> And what about the timetable?<br>
<strong>SADIE:</strong> Any time I've been in town in the evening I've noticed you have to wait a long time for a bus – there aren't that many.<br>
<strong>MAN:</strong> So now I'd like to ask you about your car use.<br>
<strong>SADIE:</strong> Well, I have got a car but I don't use it that often. Mainly just to go to the supermarket. My husband uses it at the weekends to go to the golf club.<br>
<strong>MAN:</strong> And what about a bicycle?<br>
<strong>SADIE:</strong> I don't actually have one at the moment.<br>
<strong>MAN:</strong> What about the city bikes you can rent?<br>
<strong>SADIE:</strong> No – I'm not keen on cycling there because of all the pollution. But I would like to get a bike – it would be good to use to get to work.<br>
<strong>MAN:</strong> So why haven't you got one now?<br>
<strong>SADIE:</strong> Well, I live in a flat – on the second floor and it doesn't have any storage – so we'd have to leave it in the hall outside the flat.`,
      questions: [
        { id: 'l1',  qNum: 1,  type: 'short', text: 'Postcode:', answer: 'DW30 7YZ' },
        { id: 'l2',  qNum: 2,  type: 'short', text: 'Date of bus journey:', answer: '24th April' },
        { id: 'l3',  qNum: 3,  type: 'short', text: 'Reason for trip: shopping and visit to the ___', answer: 'dentist' },
        { id: 'l4',  qNum: 4,  type: 'short', text: 'Travelled by bus because cost of ___ too high', answer: 'parking' },
        { id: 'l5',  qNum: 5,  type: 'short', text: 'Got on bus at ___ Street', answer: 'Claxby' },
        { id: 'l6',  qNum: 6,  type: 'short', text: 'Complaint – bus today was ___', answer: 'late' },
        { id: 'l7',  qNum: 7,  type: 'short', text: 'Complaint – frequency of buses in the ___', answer: 'evening' },
        { id: 'l8',  qNum: 8,  type: 'short', text: 'Goes to the ___ by car', answer: 'supermarket' },
        { id: 'l9',  qNum: 9,  type: 'short', text: 'Dislikes cycling in the city centre because of the ___', answer: 'pollution' },
        { id: 'l10', qNum: 10, type: 'short', text: "Doesn't own a bike because of a lack of ___", answer: 'storage' },
      ]
    },
    {
      id: 's2',
      title: 'Part 2: Becoming a Volunteer for ACE',
      audioUrl: 'Resources/Cam18/Cam18_Audio/IELTS18_test1_audio2.mp3',
      transcript: `<strong>SPEAKER:</strong> Good evening, everyone. Let me start by welcoming you all to this talk and thanking you for taking the time to consider joining ACE voluntary organisation. ACE offers support to people and services in the local area and we're now looking for more volunteers to help us do this.<br><br>
By the way, I hope you're all comfortable – we have brought in extra seats so that no one has to stand, but it does mean that the people at the back of the room may be a bit squashed. We'll only be here for about half an hour so, hopefully, that's OK.<br><br>
One of the first questions we're often asked is how old you need to be to volunteer. Well, you can be as young as 16 or you can be 60 or over; it all depends on what type of voluntary work you want to do. Other considerations, such as reliability, are crucial in voluntary work and age isn't related to these, in our experience.<br><br>
Another question we get asked relates to training. Well, there's plenty of that and it's all face-to-face. What's more, training doesn't end when you start working for us – it takes place before, during and after periods of work. Often, it's run by other experienced volunteers as managers tend to prefer to get on with other things.<br><br>
Now, I would ask you to consider a couple of important issues before you decide to apply for voluntary work. We don't worry about why you want to be a volunteer – people have many different reasons. But it is critical that you have enough hours in the day for whatever role we agree is suitable for you. You may think that your income is important, but we don't ask about that. What we value is dedication.<br><br>
OK, so let's take a look at some of the work areas. If you have the creativity to come up with an imaginative or novel way of fundraising, we'd be delighted. One outdoor activity is litter collection – it's useful if you can walk for long periods, sometimes uphill. If you enjoy working with children, we have vacancies for 'playmates' who help children learn about staying healthy. You don't need to have children yourself, but it's good if you know something about nutrition. If that doesn't appeal to you, maybe you'd be interested in helping out at our story club for disabled children, especially if you have done some acting. The last area is first aid – initially your priority will be to take in a lot of information and not forget any important steps or details.`,
      questions: [
        { id: 'l11', qNum: 11, type: 'mcq',
          text: 'Why does the speaker apologise about the seats?',
          options: ['A. They are too small.', 'B. There are not enough of them.', 'C. Some of them are very close together.'],
          answer: 'C' },
        { id: 'l12', qNum: 12, type: 'mcq',
          text: 'What does the speaker say about the age of volunteers?',
          options: ['A. The age of volunteers is less important than other factors.', 'B. Young volunteers are less reliable than older ones.', 'C. Most volunteers are about 60 years old.'],
          answer: 'A' },
        { id: 'l13', qNum: 13, type: 'mcq',
          text: 'What does the speaker say about training?',
          options: ['A. It is continuous.', 'B. It is conducted by a manager.', 'C. It takes place online.'],
          answer: 'A' },
        { id: 'l14_15', qNum: '14&15', type: 'multi', count: 2,
          text: 'Which <strong>TWO</strong> issues does the speaker ask the audience to consider before they apply to be volunteers?',
          options: ['A. their financial situation', 'B. their level of commitment', 'C. their work experience', 'D. their ambition', 'E. their availability'],
          answer: ['B', 'E'] },
        { id: 'l16', qNum: 16, type: 'mcq',
          text: 'What would be helpful for <strong>Fundraising</strong>?<br><div class="matching-hint-box"><strong>Helpful things volunteers might offer</strong><br>A. experience on stage &nbsp;·&nbsp; B. original, new ideas &nbsp;·&nbsp; C. parenting skills<br>D. an understanding of food and diet &nbsp;·&nbsp; E. retail experience &nbsp;·&nbsp; F. a good memory &nbsp;·&nbsp; G. a good level of fitness</div>',
          options: ['experience on stage', 'original, new ideas', 'parenting skills', 'an understanding of food and diet', 'retail experience', 'a good memory', 'a good level of fitness'],
          answer: 'B' },
        { id: 'l17', qNum: 17, type: 'mcq',
          text: 'What would be helpful for <strong>Litter collection</strong>?',
          options: ['experience on stage', 'original, new ideas', 'parenting skills', 'an understanding of food and diet', 'retail experience', 'a good memory', 'a good level of fitness'],
          answer: 'G' },
        { id: 'l18', qNum: 18, type: 'mcq',
          text: "What would be helpful for <strong>'Playmates'</strong>?",
          options: ['experience on stage', 'original, new ideas', 'parenting skills', 'an understanding of food and diet', 'retail experience', 'a good memory', 'a good level of fitness'],
          answer: 'D' },
        { id: 'l19', qNum: 19, type: 'mcq',
          text: 'What would be helpful for <strong>Story club</strong>?',
          options: ['experience on stage', 'original, new ideas', 'parenting skills', 'an understanding of food and diet', 'retail experience', 'a good memory', 'a good level of fitness'],
          answer: 'A' },
        { id: 'l20', qNum: 20, type: 'mcq',
          text: 'What would be helpful for <strong>First aid</strong>?',
          options: ['experience on stage', 'original, new ideas', 'parenting skills', 'an understanding of food and diet', 'retail experience', 'a good memory', 'a good level of fitness'],
          answer: 'F' },
      ]
    },
    {
      id: 's3',
      title: 'Part 3: Talk on Jobs in Fashion Design',
      audioUrl: 'Resources/Cam18/Cam18_Audio/IELTS18_test1_audio3.mp3',
      transcript: `<strong>HUGO:</strong> Hi Chantal. What did you think of the talk, then?<br>
<strong>CHANTAL:</strong> I thought it was good once I'd moved seats.<br>
<strong>HUGO:</strong> Oh – were the people beside you chatting or something?<br>
<strong>CHANTAL:</strong> It wasn't that. I went early so that I'd get a seat and not have to stand, but then this guy sat right in front of me and he was so tall!<br>
<strong>HUGO:</strong> It's hard to see through people's heads, isn't it?<br>
<strong>CHANTAL:</strong> Impossible! Anyway, I thought it was really interesting, especially what the speaker said about the job market.<br>
<strong>HUGO:</strong> Me too. I mean we know we're going into a really competitive field.<br>
<strong>CHANTAL:</strong> Yeah, but it looks like there's a whole range of areas of work that we hadn't even thought of – like fashion journalism, for instance.<br>
<strong>HUGO:</strong> Mmm. Overall, she had quite a strong message, didn't she?<br>
<strong>CHANTAL:</strong> She kept saying things like 'I know you all think this, but …' and then she'd tell us how it really is.<br>
<strong>CHANTAL:</strong> It was a bit harsh, though! We know it's a tough industry.<br>
<strong>HUGO:</strong> Yeah – and we're only first years, after all. We've got a lot to learn.<br>
<strong>CHANTAL:</strong> Do you think our secondary-school education should have been more career-focused?<br>
<strong>HUGO:</strong> Well, we had numerous talks on careers, but none of them were very inspiring. They could have asked more people like today's speaker to talk to us.<br>
<strong>CHANTAL:</strong> I agree. We were told about lots of different careers – just when we needed to be, but not by the experts who really know stuff.<br>
<strong>HUGO:</strong> So did today's talk influence your thoughts on your future career?<br>
<strong>CHANTAL:</strong> Well, I promised myself that I'd go through this course and keep an open mind till the end.<br>
<strong>HUGO:</strong> But I think it's better to pick an area of the industry now and then aim to get better and better at it.<br>
<strong>CHANTAL:</strong> Well, I think we'll just have to differ on that issue!<br>
<strong>HUGO:</strong> One thing's for certain – from what she said, we'll be unpaid assistants in the industry for quite a long time.<br>
<strong>HUGO:</strong> I'm prepared for that, aren't you?<br>
<strong>CHANTAL:</strong> Actually, I'm not going to accept that view.<br><br>
<strong>CHANTAL:</strong> I thought the speaker's account of her first job was fascinating.<br>
<strong>HUGO:</strong> Yeah – she admitted she was lucky to get work being a personal dresser for a musician. She didn't even apply for the job.<br>
<strong>CHANTAL:</strong> It must have felt amazing – though she said all she was looking for back then was experience, not financial reward.<br>
<strong>HUGO:</strong> Mmm. And then he was so mean, telling her she was more interested in her own appearance than his!<br>
<strong>CHANTAL:</strong> But – she did realise he was right about that. I'm always considering my own clothes but now I can see you should be focusing on your client!<br>
<strong>CHANTAL:</strong> As she said, she should have hidden her negative feelings about him, but she didn't.<br>
<strong>HUGO:</strong> It would be useful to know if there's a gap in the market – an item that no one's stocking but that consumers are looking for.<br>
<strong>HUGO:</strong> Imagine you worked in an expensive shop and you found out the garments sold there were being returned because they fell apart in the wash!<br>
<strong>CHANTAL:</strong> Yeah, it would be good to know that kind of thing.`,
      questions: [
        { id: 'l21', qNum: 21, type: 'mcq',
          text: 'What problem did Chantal have at the start of the talk?',
          options: ['A. Her view of the speaker was blocked.', 'B. She was unable to find an empty seat.', 'C. The students next to her were talking.'],
          answer: 'A' },
        { id: 'l22', qNum: 22, type: 'mcq',
          text: 'What were Hugo and Chantal surprised to hear about the job market?',
          options: ['A. It has become more competitive than it used to be.', 'B. There is more variety in it than they had realised.', 'C. Some areas of it are more exciting than others.'],
          answer: 'B' },
        { id: 'l23', qNum: 23, type: 'mcq',
          text: "Hugo and Chantal agree that the speaker's message was",
          options: ['A. unfair to them at times.', 'B. hard for them to follow.', 'C. critical of the industry.'],
          answer: 'A' },
        { id: 'l24', qNum: 24, type: 'mcq',
          text: 'What do Hugo and Chantal criticise about their school careers advice?',
          options: ['A. when they received the advice', 'B. how much advice was given', 'C. who gave the advice'],
          answer: 'C' },
        { id: 'l25', qNum: 25, type: 'mcq',
          text: 'When discussing their future, Hugo and Chantal disagree on',
          options: ['A. which is the best career in fashion.', 'B. when to choose a career in fashion.', 'C. why they would like a career in fashion.'],
          answer: 'B' },
        { id: 'l26', qNum: 26, type: 'mcq',
          text: 'How does Hugo feel about being an unpaid assistant?',
          options: ['A. He is realistic about the practice.', 'B. He feels the practice is dishonest.', 'C. He thinks others want to change the practice.'],
          answer: 'A' },
        { id: 'l27_28', qNum: '27&28', type: 'multi', count: 2,
          text: 'Which <strong>TWO</strong> mistakes did the speaker admit she made in her first job?',
          options: ['A. being dishonest to her employer', 'B. paying too much attention to how she looked', 'C. expecting to become well known', 'D. trying to earn a lot of money', 'E. openly disliking her client'],
          answer: ['B', 'E'] },
        { id: 'l29_30', qNum: '29&30', type: 'multi', count: 2,
          text: 'Which <strong>TWO</strong> pieces of retail information do Hugo and Chantal agree would be useful?',
          options: ['A. the reasons people return fashion items', 'B. how much time people have to shop for clothes', "C. fashion designs people want but can't find", 'D. the best time of year for fashion buying', 'E. the most popular fashion sizes'],
          answer: ['A', 'C'] },
      ]
    },
    {
      id: 's4',
      title: 'Part 4: Elephant Translocation',
      audioUrl: 'Resources/Cam18/Cam18_Audio/IELTS18_test1_audio4.mp3',
      transcript: `<strong>SPEAKER:</strong> For my presentation today I want to tell you about how groups of elephants have been moved and settled in new reserves. This is known as translocation and has been carried out in Malawi in Africa in recent years, because of overpopulation of elephants in some areas.<br><br>
In Malawi's Majete National Park the elephant population had been wiped out by poachers, who killed the elephants for their ivory. But in 2003, the park was restocked and effective law enforcement was introduced. Since then, not a single elephant has been poached. In this safe environment, the elephant population boomed. Breeding went so well that there were more elephants than the park could support.<br><br>
This led to a number of problems. There was more competition for food, which meant some elephants were suffering from hunger. Elephants were routinely knocking down fences around the park, which then had to be repaired at significant cost.<br><br>
To solve this problem, the decision was made to move dozens of elephants from Majete National Park to Nkhotakota Wildlife Park. Elephants were moved in groups of between eight and twenty, all belonging to one family. A team of vets and park rangers flew over the park in helicopters and targeted a group, which were rounded up and directed to a designated open plain.<br><br>
The vets then used darts to immobilise the elephants. This also had to be done as quickly as possible so as to minimise the stress caused. To avoid the risk of suffocation, the team had to make sure none of the elephants were lying on their chests because their lungs could be crushed in this position. So all the elephants had to be placed on their sides. It was very important to keep an eye on their breathing – if there were fewer than three breaths per minute, the elephant would need urgent medical attention. Measurements were taken of each elephant's tusks – elephants with large tusks would be at greater risk from poachers – and also of their feet. The elephants were then transported to their new home.<br><br>
The elephants translocated to Nkhotakota settled in very well. Employment prospects have improved enormously, contributing to rising living standards for the whole community. Many former poachers volunteered to give up their weapons, as they were no longer of any use to them. All this has been a big draw for tourism, which contributes five times more than the illegal wildlife trade to GDP.`,
      questions: [
        { id: 'l31', qNum: 31, type: 'short', text: 'Damage to ___ in the park (caused by elephants knocking them down)', answer: 'fences' },
        { id: 'l32', qNum: 32, type: 'short', text: 'A suitable group of elephants from the same ___ was selected', answer: 'family' },
        { id: 'l33', qNum: 33, type: 'short', text: 'Vets and park staff used ___ to help guide the elephants into an open plain', answer: 'helicopters' },
        { id: 'l34', qNum: 34, type: 'short', text: 'Process had to be completed quickly to reduce ___', answer: 'stress' },
        { id: 'l35', qNum: 35, type: 'short', text: 'Elephants had to be turned on their ___ to avoid damage to their lungs', answer: 'sides' },
        { id: 'l36', qNum: 36, type: 'short', text: "Elephants' ___ had to be monitored constantly", answer: 'breathing' },
        { id: 'l37', qNum: 37, type: 'short', text: 'Data including the size of their tusks and ___ was taken', answer: 'feet' },
        { id: 'l38', qNum: 38, type: 'short', text: '___ opportunities at Nkhotakota improved enormously', answer: 'employment' },
        { id: 'l39', qNum: 39, type: 'short', text: 'Reduction in the number of poachers and ___ (former poachers gave them up)', answer: 'weapons' },
        { id: 'l40', qNum: 40, type: 'short', text: 'Increase in ___ as a contributor to GDP', answer: 'tourism' },
      ]
    }
  ]
};

const SPEAKING_DATA = {
  part1: {
    title: 'Part 1: Introduction & Interview (4–5 minutes)',
    questions: [
      "Let's talk about your hometown. Where are you from, and what do you like about it?",
      "Do you work or are you a student? What do you do?",
      "What do you enjoy doing in your free time?",
      "How do you usually spend your weekends?",
      "Do you prefer spending time indoors or outdoors? Why?"
    ]
  },
  part2: {
    title: 'Part 2: Long Turn (3–4 minutes)',
    cueCard: {
      topic: 'Describe a book or film that had a significant impact on you.',
      bullets: [
        'What the book/film is called',
        'When you read or watched it',
        'What it is about',
        'Why it had a significant impact on you'
      ],
      note: 'You have 1 minute to prepare. Speak for 1–2 minutes.'
    }
  },
  part3: {
    title: 'Part 3: Discussion (4–5 minutes)',
    questions: [
      "Do you think reading books is becoming less popular with the rise of digital media? Why or why not?",
      "How can films and literature influence people's values and behaviour?",
      "Some people say that schools should prioritise teaching literature over practical subjects. To what extent do you agree?",
      "How does the entertainment industry differ across different cultures?"
    ]
  }
};

/* ============================================================
   ===== TEST PACKAGES (multi-test architecture) =====
   Packages are keyed by package ID (e.g. 'cam18').
   Each package has a 'tests' map keyed by test ID ('test1'–'test4').
   Additional packages can be added by loading data-{pkg}.js after
   this file — those scripts call into TEST_PACKAGES directly.
   ============================================================ */
const TEST_PACKAGES = {
  'cam18': {
    id: 'cam18',
    name: 'Cambridge IELTS 18',
    tests: {
      'test1': {
        id: 'test1', name: 'Test 1',
        listening: LISTENING_DATA,
        reading:   READING_DATA,
        writing:   WRITING_DATA,
        speaking:  SPEAKING_DATA,
      },
      'test2': { id: 'test2', name: 'Test 2', listening: null, reading: null, writing: null, speaking: null },
      'test3': { id: 'test3', name: 'Test 3', listening: null, reading: null, writing: null, speaking: null },
      'test4': { id: 'test4', name: 'Test 4', listening: null, reading: null, writing: null, speaking: null },
    }
  }
};
