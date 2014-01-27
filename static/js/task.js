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
var demographic = []; // Needs to be global
var condition = psiTurk.taskdata.get('condition'); // Get condition from server (starts at 0)

// Function to generate matrix of all conditions
    var genCol = function() {
        // The three individual columns
        var col1 = [], col2 = [], col3 = [];
        for (var n = 0; n < 10; n++) {col1 = col1.concat([1, 2, 3])}
        for (n = 0; n < 15; n++) {col2 = col2.concat([1, 1, 1, 2, 2, 2])}
        for (n = 1; n < 6; n++) {col3 = col3.concat([n, n, n, n, n, n])} // Careful: n starts at 1
        // Converting three separate 1D arrays into one 3D array
        var cols = [col1, col2, col3];
        var arr = new Array();
        for (var i = 0; i <= cols.length - 1; i++) {
             arr[i] = new Array();
             for (var j = 0; j <= col1.length - 1; j++) {
                 arr[i][j] = cols[i][j];
             }
        }
        return arr;
    };

    // Create the condition matrix
    var arr = genCol();

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
    var texts = ["You will also see the number of points you could have won by choosing the other cards.", "You will also be shown the maximum number of points you could have won on that trial. This may be the points you won from the card you chose, but it could also be the points you could have won by selecting a card from a different deck."];

    //console.log(condition);
    //console.log(arr);

    function isNumber(n) {
        return !isNaN(parseFloat(n)) && isFinite(n);
    }
	
	var next = function() {
		psiTurk.showPage(instruction_pages[currentscreen]);
        // Condition specific instructions
        // Max value
        if (arr[0][condition] == 2) {
            document.getElementById("condText").innerHTML = texts[1];
        }
        else if (arr[0][condition] == 3) {
            document.getElementById("condText").innerHTML = texts[0];
        }
		$('.continue').click(function() {
            var gender = $('form input[type=radio]:checked').val();
            // Make sure is a number
            if (isNumber($('form input[type=text]').val())) {
                var age = $('form input[type=text]').val();
            }
            if (age && gender) {
                demographic = [gender, age];
			    buttonPress();
            } else {
                alert('Please select your gender and enter your age.')
            }
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

    // Structure of data:
    //  data ==== trialX ==== 'chosen_card'
    //                   ==== 'chosen_value'
    //                   ==== 'max_value'
    //                   ==== 'trialNumber'
    //                   ==== 'condition'
    //                   ==== 'cardX' ==== 'R'
    //                                ==== 'mu'

    // In order to randomise card order presentation need to have randomly permuted array of card indexes...
    var shuffle = function(array) {
        var m = array.length, t, i;
        while (m) {
            i = Math.floor(Math.random() * m--);
            t = array[m];
            array[m] = array[i];
            array[i] = t;
        }
        return array;
    };
    // In order to work back from this level of abstraction need to use index of shuffDeck (an index of an index...)
    // Premised on actual number of deck shown (i.e. leftmost card [= 1]) being irrelevant and can be ignored so long as all clicks etc. converted back to unrandomised order (i.e. by shuffDeck.indexOf(randomDeckNo) + 1)
    var shuffDeck = shuffle([1, 2, 3, 4]);

    // Experiment design (factors and levels): 3 x 2 x 5: forgone x dynamic x seed
    // E.g.: 'condition'=1: forgone=1 (show one) -- dynamic=1 (dynamic) -- seed=1 (1st seed)
    //       'condition'=2: forgone=2 (show max) -- dynamic=1 (dynamic) -- seed=1 (1st seed)
    //       'condition'=3: forgone=3 (show all) -- dynamic=1 (dynamic) -- seed=1 (1st seed)
    //       'condition'=4: forgone=1 (show one) -- dynamic=2 (non-dynamic) -- seed=1 (1st seed)
    //       'condition'=5: forgone=2 (show max) -- dynamic=2 (non-dynamic) -- seed=1 (1st seed)
    //       'condition'=6: forgone=3 (show all) -- dynamic=2 (non-dynamic) -- seed=1 (1st seed)
    //       'condition'=7: forgone=1 (show one) -- dynamic=1 (dynamic) -- seed=2 (2nd seed) etc.

    // Create a matrix of all conditions [1, 1, 1; 2, 1, 1; 3, 1, 1; 1, 2, 1 etc. Then in the manipulation if-blocks
    // compare relevant column and relevant row (psiTurk.condition + 1) against the manipulation if-condition:
    // e.g. For forgone=2 (show max) compare "2" to column=1, row=psiTurk.condition (careful of index), if True then deploy.


    // Globals
    var seeds = [72, 21, 26, 135, 332];
    var m = new MersenneTwister(seeds[arr[2][condition] - 1]); // -1 because seeds in column start at 1
    var lambda = 0.9836;
    var cardSelected = false;
    var cumulative = 0;
    var data = {};
    var trial = 1; // Initialising trial
    var maxTrial = 50; // Number of trials
    var timestamp = new Date().getTime(); // Initialise record time as soon as new set of cards

    // Normal random number generator; Box-Muller transform (ignoring second random value returned 'y')
    var rnd = function rnd(mean, stDev) {
        var x = 0, y = 0, rds, c;

        do {
        x = m.random()*2-1;
        y = m.random()*2-1;
        rds = x*x + y*y;
        }
        while (rds == 0 || rds > 1);

        c = Math.sqrt(-2 * Math.log(rds) / rds);

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
            // Dynamic condition (1): use the delta indicator functions
            if (arr[1][condition] == 1) {
                // Will be NaN on first trial as no prior trials to compare to... Need to compare IDs in case of duplicate numbers
                // Comparing int of html ID tag, converted from deck to data, against string of data element, so need to strip string and turn to int
                if (data[trial - 1]['chosen_card'] == parseInt(card.replace('card',''))) {
                    delta1 = 1;
                    delta2 = 0;
                }
                else {
                    delta1 = 0;
                    delta2 = 1;
                }
            }
            // Non-dynamic condition (2): ignore the delta indicator functions CHANGE TO ELSE IF AND ADD SPECIFIC CONDITIONS
            else {
                delta1 = delta2 = 0;
            }
        //console.log(card, 'd1=' + delta1, 'd2=' + delta2, 't-1_chosen=' + data[trial - 1]['chosen_card']);
        var mu = lambda*data[trial - 1][card]['mu'] + (1 - lambda) * 50 - (6 * delta1) + (2 * delta2) + rnd(0, 2.8); // Includes weighted variable towards 50
        //console.log('card='+card,'mu='+mu, 'data[trial - 1][card]["mu"]='+data[trial - 1][card]['mu'], '(6 * delta1)='+(6 * delta1), '(2 * delta2)='+(2 * delta2));
        var R = mu + rnd(0, 4.0);

        return {R: Math.round(R),
                mu: mu,
                fullR: R
        };
    };

    //  Function to generate numbers, stored in data. Have to initialise all levels of data. New data[trial] made each trial
    var genNumbers = function() {
        data[trial] = {};
        for (var i = 1; i <= 4; i++) {
            data[trial]['card' + i] = {}; // Initialising sub-level
            var values = calcR('card' + i); // Calculate values for each card
            // Assign values to specific 'card' in 'data'
            data[trial]['card' + i]['R'] = values.R;
            data[trial]['card' + i]['mu'] = values.mu;
            data[trial]['card' + i]['fullR'] = values.fullR; // Recording unrounded R as error term added to mu
        }
        return data[trial];
    };

    // Function to set cards to 0; to prevent cheating
    var setBlanks = function() {
        for (var i = 1; i <= 4; i++) {
            $('#' + i).html('0');
        }
    };

    // Function to set cards,input= data[trial], randomised using the shuffDeck array made earlier
    var setCards = function(values) {
        for (var i = 0; i <= 3; i++) {
            $('#' + (i + 1)).html(values['card' + shuffDeck[i]]['R']); // i + 1 because i = 0 (for index)
        }
    };

    var next = function() {

        // When a card is selected
        $('._card').click(function () {
            var rt = (new Date().getTime()) - timestamp; // Record time as soon as they've clicked
            // Prevent multiple cards being selected
            if (cardSelected == false) {
                cardSelected = true;

                // Initialise trial - 1 for first trial to use. Must initialise all levels
                if (trial == 1) {
                    data[trial - 1] = {};
                    // Arbitrary, set it to initial position. 'R' unnecessary
                    for (var i = 1; i <= 4; i++) {
                        data[trial - 1]['card' + i] = {}; // Initialising sub-level
                        data[trial - 1]['card' + i]['mu'] = rnd(50, 10);
                    }
                }
                // Get and set cards
                data[trial] = genNumbers();
                setCards(data[trial]);


                // Show card picked
                var card = $(this).find('p', 'first');
                card.slideDown();

                // Record meta-information. All data recorded from 'data' level (vs. abstracted and randomised 'deck' level [counterbalancing of deck presentation order])
                // Must add new added data to trialSet.push()
                data[trial]['chosen_card'] = shuffDeck[parseInt(card.attr('id')) - 1]; // Randomised, so card.attr('id') no longer the same card & value as data[trial][cardX]. Going from deck --> data (level) so have to use indexOf + 1
                data[trial]['chosen_value'] = data[trial]['card'+ data[trial]['chosen_card']]['R']; // The opposite of 'chosen_card'; need to go from data --> deck
                data[trial]['max_value'] = Math.max(data[trial]['card1']['R'], data[trial]['card2']['R'], data[trial]['card3']['R'], data[trial]['card4']['R']);
                data[trial]['trialNumber'] = trial;
                data[trial]['condition'] = condition; // Starts at 0
                data[trial]['cumulative'] = cumulative = cumulative + data[trial]['chosen_value'];
		        data[trial]['permutation'] = shuffDeck;
                data[trial]['gender'] = demographic[0];
                data[trial]['age'] = demographic[1];

                // For testing- iterate through data and print to console OLD DATA
//                for (var x in data[trial]) {
//                    console.log(x, data[trial][x]);
//                }
//                console.log('RT= ' + rt);
//                console.log('shuffDeck= ' + shuffDeck);
//                console.log('Sum= ' + (data[trial]['card1']['R'] + data[trial]['card2']['R'] + data[trial]['card3']['R'] + data[trial]['card4']['R']), "Running mean: " + cumulative/trial);
//                console.log('Condition= ' + condition);
//                console.log('Seed: ' + seeds[arr[2][condition] - 1]);
//		        console.log('0mu: ', data[0]['card1']['mu'], data[0]['card2']['mu'], data[0]['card3']['mu'], data[0]['card4']['mu']);


                // Note: timings are not additive: all absolute and begin at 0
                // Foregone condition 1: unnecessary to code, (show card picked)
                // Foregone condition 2: (show card picked) and max alternative, wait hiddenTime
                if (arr[0][condition] == 2) {
                    setTimeout(function() {
                        $('ul.list-unstyled li').html('The maximum from this trial was ' + data[trial]['max_value']).slideDown();
                    }, 1000);
                }
                // Foregone condition 3: (show card picked) followed by all remaining, hidden cards. Wait hiddenTime
                else if (arr[0][condition] == 3) {
                    setTimeout(function() {
                        $('._card :hidden').slideDown();
                    }, 1000);
                }

                // Save data to psiTurk object (via an array). After wait due to timestamp
                    var trialSet = [];
                    trialSet.push(data[trial]['chosen_card'], data[trial]['chosen_value'], data[trial]['max_value'],
                                  data[trial]['trialNumber'], data[trial]['condition'], data[trial]['cumulative'],
                                  data[trial]['permutation'], data[trial]['gender'], data[trial]['age'], rt);
                    for (var y = 1; y <= 4; y++) {
                        trialSet.push('Card ' + y + ' R:');
                        trialSet.push(data[trial]['card' + y]['fullR']); // Recording unrounded R as error term added to mu
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

                    timestamp = new Date().getTime(); // Record time as soon as new set of cards, so doesn't include wait time

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
