/*
 * Requires:
 *     psiturk.js
 *     utils.js
 *     twister.js
 */

// Initalize psiturk object
var psiTurk = PsiTurk();

// All pages to be loaded
var pages = [
	"instruct.html",
	"test.html",
	"postquestionnaire.html"
];

psiTurk.preloadPages(pages);

// Task object to keep track of the current phase
var currentview;


/********************
* HTML manipulation
*
* All HTML files in the templates directory are requested 
* from the server when the PsiTurk object is created above. We
* need code to get those pages from the PsiTurk object and 
* insert them into the document.
*
********************/


/*************************
* INSTRUCTIONS         
*************************/

var Instructions = function(pages) {
	var currentscreen = 0,
	    timestamp;
	    instruction_pages = pages; 
	
	var next = function() {
		psiTurk.showPage(instruction_pages[currentscreen]);
		$('.continue').click(function() {
			buttonPress();
		});
		
		currentscreen = currentscreen + 1;

		// Record the time that an instructions page is presented
		timestamp = new Date().getTime();
	};

	var buttonPress = function() {

		// Record the response time
		var rt = (new Date().getTime()) - timestamp;
		psiTurk.recordTrialData(["INSTRUCTIONS", currentscreen, rt]);

		if (currentscreen == instruction_pages.length) {
			finish();
		} else {
			next();
		}

	};

	var finish = function() {
		// Record that the user has finished the instructions and 
		// moved on to the experiment. This changes their status code
		// in the database.
		psiTurk.finishInstructions();

		// Move on to the experiment 
		currentview = new TestPhase();
	};

	next();
};



/********************
* BANDIT TEST       *
********************/

var TestPhase = function() {
    // Globals
    var m = new MersenneTwister();
    var cardSelected = false;
    // Randomise mu starting values: average 50, but not all 50. Values bound by 55 and init1 (init1 picked randomly between 55 and 65)
    var init1, init2, init3, init4; // Declare locally to prevent becoming global
    var initialMu = [init1 = m.random() * (65 - 55) + 55, init2 = 50 - (init1 - 50), init3 = init1 - (init1 - 50) / 2, init4 = 50 - (init3 - 50)]; // Starting value
    var cumulative = 0;
    var data = {};
    var trial = 1; // Initialising trial
    var maxTrial = 10; // Number of trials
    var condition= psiTurk.taskdata.get('condition') + 1; // Get condition from server, add 1 to start from 1

    // Structure of data:
    //  data ==== trialX ==== 'chosen_card'
    //                   ==== 'chosen_value'
    //                   ==== 'max_value'
    //                   ==== 'trialNumber'
    //                   ==== 'condition'
    //                   ==== 'cardX' ==== 'R'
    //                                ==== 'mu'

    // Experiment design (factors and levels): 3 x 2 x 5: forgone x dynamic x seed
    // E.g.: 'condition'=1: forgone=1 (show one) -- dynamic=1 (dynamic) -- seed=1 (1st seed)
    //       'condition'=2: forgone=2 (show max) -- dynamic=1 (dynamic) -- seed=1 (1st seed)
    //       'condition'=3: forgone=3 (show all) -- dynamic=1 (dynamic) -- seed=1 (1st seed)
    //       'condition'=4: forgone=1 (show one) -- dynamic=2 (non-dynamic) -- seed=1 (1st seed) etc.

    // Normal random number generator; Box-Muller transform (ignoring second random value returned 'y')
    var rnd = function rnd(mean, stDev) {
        var x = 0, y = 0, rds, c;

        do {
        x = m.random()*2-1;
        y = m.random()*2-1;
        rds = x*x + y*y;
        }
        while (rds == 0 || rds > 1);

        c = Math.sqrt(-2*Math.log(rds)/rds);

        return x * c * stDev + mean;
    };

    // Payout function:

    // R[j](t) = mu[j](t) + epsilon[j](t)
    // mu[j](t) = mu[j](t-1) - 6 * delta1[j](t-1) + 2 * delta2[j](t-1) + psi[j](t)

    // Where:
    // * R[j](t) is the reward of deck j on trial t
    // * epsilon[j](t) is a random Normal variate with mean 0 and standard deviation sigma[e]
    // * mu[j](t) is the mean reward of deck j on trial t
    // * delta1[j](t-1) is an indicator function with value 1 if deck j was chosen on trial t-1 and 0 otherwise
    // * delta2[j](t-1) is an indicator function with value 1 if deck j was not chosen on trial t-1 and 0 otherwise
    // * psi[j](t) is a random Normal variate with mean 0 and standard deviation sigma[p]

    // calcR argument is a string: 'cardX'
    var calcR = function(card) {
        var delta1, delta2; // Indicator function assignment
            // Dynamic condition: use the delta indicator functions
            if (condition == (1 || 2 || 3)) {
                // Will be NaN on first trial as no prior trials to compare to... Need to compare IDs in case of duplicate numbers
                // Comparing int of html ID tag against string of data element, so need to strip string and turn to int
                if (data[trial - 1]['chosen_card'] == parseInt(card.replace('card',''))) {
                    delta1 = 1;
                    delta2 = 0;
                }
                else {
                    delta1 = 0;
                    delta2 = 1;
                }
            }
            // Non-dynamic condition: ignore the delta indicator functions CHANGE TO ELSE IF AND ADD SPECIFIC CONDITIONS
            else {
                delta1 = delta2 = 0;
            }
        //console.log(card, 'd1=' + delta1, 'd2=' + delta2, 't-1_chosen=' + data[trial - 1]['chosen_card']);
        var mu = data[trial - 1][card]['mu'] - (6 * delta1) + (2 * delta2) + rnd(0, 1);
        //console.log('card='+card,'mu='+mu, 'data[trial - 1][card]["mu"]='+data[trial - 1][card]['mu'], '(6 * delta1)='+(6 * delta1), '(2 * delta2)='+(2 * delta2));
        var R = mu + rnd(0, 1);

        return {R: Math.round(R),
                mu: mu
        };
    };

        // Function to generate random numbers
//      var genNumbers = function() {
//          for (var i = 1; i <= 4; i++) {
//              data[trial]['card' + i] = {};
//              data[trial]['card' + i]['R'] = Math.floor(Math.random()*51);
//          }
//        return data[trial];
//      };

    //  Function to generate numbers, stored in data. Have to initialise all levels of data. New data[trial] made each trial
    var genNumbers = function() {
        data[trial] = {};
        for (var i = 1; i <= 4; i++) {
            data[trial]['card' + i] = {}; // Initialising sub-level
            var values = calcR('card' + i); // Calculate values for each card
            // Assign values to specific 'card' in 'data'
            data[trial]['card' + i]['R'] = values.R;
            data[trial]['card' + i]['mu'] = values.mu;
        }
        return data[trial];
    };

    // Function to set cards to 0; to prevent cheating
    var setBlanks = function() {
        for (var i = 1; i <= 4; i++) {
            $('#' + i).html('0');
        }
    };

    // Function to set cards,input= data[trial]
    var setCards = function(values) {
        for (var i = 1; i <= 4; i++) {
            $('#' + i).html(values['card' + i]['R']);
        }
    };

    var next = function() {

        // When a card is selected
        $('._card').click(function () {
            // Prevent multiple cards being selected
            if (cardSelected == false) {
                cardSelected = true;

                // Initialise trial - 1 for first trial to use. Must initialise all levels
                if (trial == 1) {
                    data[trial - 1] = {};
                    // Arbitrary, set it to initial position. 'R' unnecessary
                    for (var i = 1; i <= 4; i++) {
                        data[trial - 1]['card' + i] = {}; // Initialising sub-level
                        data[trial - 1]['card' + i]['mu'] = initialMu[i - 1];
                    }
                }
                // Get and set cards
                data[trial] = genNumbers();
                setCards(data[trial]);

                // For testing- iterate through data and print to console OLD DATA
                for (var x in data[trial]) {
                    console.log(x, data[trial][x]);
                }
                console.log('card_sum=' + (data[trial]['card1']['R'] + data[trial]['card2']['R'] + data[trial]['card3']['R'] + data[trial]['card4']['R']));
                console.log('Trial=' + trial);

                // Show card picked
                var card = $(this).find('p', 'first');
                card.slideDown();

                // Record meta-information
                data[trial]['chosen_card'] = parseInt(card.attr('id'));
                data[trial]['chosen_value'] = parseInt($('#' + data[trial]['chosen_card']).html());
                data[trial]['max_value'] = Math.max(data[trial]['card1']['R'], data[trial]['card2']['R'], data[trial]['card3']['R'], data[trial]['card4']['R']);
                data[trial]['trialNumber'] = trial;
                data[trial]['condition'] = condition;
                data[trial]['cumulative'] = cumulative = cumulative + data[trial]['chosen_value'];

                // Note: timings are not additive: all absolute and begin at 0
                // Foregone condition 1: unnecessary to code, (show card picked)
                // Foregone condition 2: (show card picked) and max alternative, wait hiddenTime
                if (condition == (2 || 5)) {
                    setTimeout(function() {
                        $('ul.list-unstyled li').html('The maximum from this trial was ' + data[trial]['max_value']).slideDown();
                    }, 1000);
                }
                // Foregone condition 3: (show card picked) followed by all remaining, hidden cards. Wait hiddenTime
                else if (condition == (3 || 6)) {
                    setTimeout(function() {
                        $('._card :hidden').slideDown();
                    }, 1000);
                }

                // Save data to psiTurk object (via an array)
                var trialSet = [];
                trialSet.push(data[trial]['chosen_card'], data[trial]['chosen_value'], data[trial]['max_value'],
                              data[trial]['trialNumber'], data[trial]['condition']);
                for (var y = 1; y <= 4; y++) {
                    trialSet.push('Card ' + y + ' R:');
                    trialSet.push(data[trial]['card' + y]['R']);
                    trialSet.push('Card ' + y + ' mu:');
                    trialSet.push(data[trial]['card' + y]['mu']);
                }
                psiTurk.recordTrialData(trialSet);

                // Add delay to trials
                setTimeout(function () {

                    // Re-hide all new cards and messages
                    $('._card p').hide();
                    $('ul.list-unstyled li').hide();

                    // Update cumulative scorer
                    $('._cumulative').html('<h1>Total: ' + cumulative + '</h1>');

                    // Task finish condition
                    if (trial == maxTrial) {
                        psiTurk.saveData();
                        //psiTurk.recordBonus(); // How to use?
                        finish();
                    }

                    trial++; // Update trial number

                    setBlanks(); // Set p tags to '0' to prevent cheating (checking html between trials)

                    cardSelected = false;

                }, 3000);
            }
        });
    };

    var finish = function() {
		currentview = new Questionnaire();
	};

    // Load the test.html snippet into the body of the page
	psiTurk.showPage('test.html');

    // Start the test
	next();

};


/****************
* Questionnaire *
****************/

var Questionnaire = function() {

	var error_message = "<h1>Oops!</h1><p>Something went wrong submitting your HIT. This might happen if you lose your internet connection. Press the button to resubmit.</p><button id='resubmit'>Resubmit</button>";

	record_responses = function() {

		psiTurk.recordTrialData(['postquestionnaire', 'submit']);

		$('textarea').each( function(i, val) {
			psiTurk.recordUnstructuredData(this.id, this.value);
		});
		$('select').each( function(i, val) {
			psiTurk.recordUnstructuredData(this.id, this.value);		
		});

	};
	
	finish = function() {
		debriefing();
	};
	
	prompt_resubmit = function() {
		replaceBody(error_message);
		$("#resubmit").click(resubmit);
	};

	resubmit = function() {
		replaceBody("<h1>Trying to resubmit...</h1>");
		reprompt = setTimeout(prompt_resubmit, 10000);
		
		psiTurk.saveData({
			success: function() {
				clearInterval(reprompt); 
				finish();
			}, 
			error: prompt_resubmit}
		);
	};

	// Load the questionnaire snippet 
	psiTurk.showPage('postquestionnaire.html');
	psiTurk.recordTrialData(['postquestionnaire', 'begin']);
	
	$("#continue").click(function () {
		record_responses();
		psiTurk.teardownTask();
    	psiTurk.saveData({success: finish, error: prompt_resubmit});
	});
	
};


var debriefing = function() { window.location="/debrief?uniqueId=" + psiTurk.taskdata.id; };


/*******************
 * Run Task
 ******************/
$(window).load( function(){
    currentview = new Instructions([
		"instruct.html"
	]);
});

// vi: noexpandtab tabstop=4 shiftwidth=4
