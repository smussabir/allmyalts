const expansions = [
    { displayName: 'The War Within', value: 2569 },
    { displayName: 'Dragonflight', value: 2506 },
    { displayName: 'Shadowlands', value: 2414 },
    { displayName: 'Battle for Azeroth', value: 2104 },
    { displayName: 'Legion', value: 1834 },
    { displayName: 'Warlords of Draenor', value: 1444 },
    { displayName: 'Mists of Pandaria', value: 1245 },
    { displayName: 'Cataclysm', value: 1162 },
    { displayName: 'Wrath of the Lich King', value: 1097 },
    { displayName: 'The Burning Crusade', value: 980 },
    { displayName: 'Classic', value: 1118 },
    { displayName: 'Alliance', value: 469 },
    { displayName: 'Horde', value: 67 }
];

let timer; 
let secs = 0;
let mins = 0;

$(document).ready(function () {
    let ajaxTime = Date.now();

    // Timer functions
    function startTimer() {
        secs = 0;
        mins = 0;
        $('.load-timer').html('0s');
        timer = setInterval(function () {
            secs = secs + 1;
            if (secs > 59) {
                mins = mins + 1;
                secs = 0;
            }
            $('.load-timer').html(mins < 1 ? `${secs}s` : `${mins}m ${secs}s`);
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timer);
    }

    // Start the timer initially
    startTimer();

    // SSE for status updates
    if (!!window.EventSource) {
        var source = new EventSource('/updates');
        source.onmessage = function(e) {
            // Replace status with new message
            $('.status-updates').text(e.data);
        };
        source.onerror = function(e) {
            console.error("SSE error", e);
            source.close();
        };
    } else {
        console.log("Your browser doesn't support SSE.");
    }
    
    // AJAX call to fetch reputation data
    function fetchReps(expansionId) {
        $.ajax({
            type: "POST",
            url: "/get_reps",
            contentType: "application/json",
            data: JSON.stringify({ expansion_id: expansionId }), 
        })
            .done(function (response) {
                var totalTime = Date.now() - ajaxTime;
                console.log("Total time:", totalTime);
            
                alts = response;
            
                // Sort by level descending, then by name ascending
                alts.sort(function(a, b) {
                    // First, compare by level (descending)
                    const levelComparison = b.level - a.level;
                    if (levelComparison !== 0) {
                        return levelComparison;
                    }
                    // If levels are the same, compare by name (ascending)
                    return a.name.localeCompare(b.name);
                });
            
                $('#reps').hide().empty();
            
                // Render cards
                $.each(alts, function (i, alt) {
                    if (alt.reps.length > 0) {
                        var card = $(createCard(alt));
                        $(card).appendTo('#reps').hide();
                    }
                });
            
                // Display content
                $('#loader').fadeOut(1000);
                $('.loader-content').hide();
                $('.main-content').show();
                $('#reps').fadeIn(1000);
                $('#reps > article').show();

                $('#filterInput').off('keyup').on('keyup', function() {
                    const searchTerm = $(this).val().toLowerCase();
                
                    // For each card
                    $('.card').each(function() {
                        const card = $(this);
                        let matchFound = false;
                
                        // Check each filterable item within the card
                        card.find('[data-filter]').each(function() {
                            const filterValue = $(this).data('filter').toLowerCase();
                            const isMatch = filterValue.includes(searchTerm);
                            $(this).toggle(isMatch);
                            if (isMatch) {
                                matchFound = true;
                            }
                        });
                
                        // If no matches found within this card, hide the card
                        card.toggle(matchFound);
                    });
                });
                
                // Reset filter
                $('.reset-filter').off('click').on('click', function() {
                    // Show all cards and all filterable items
                    $('.card').show().find('[data-filter]').show();
                    $('#filterInput').val('');
                });
            })
            .fail(function (jqXHR, textStatus, errorThrown) {
                console.error("Failed to fetch reputations:", textStatus, errorThrown);
                // Stop timer on fail as well
                stopTimer();
            });
    }

    const selectElement = document.getElementById('expansionSelect');
    selectElement.innerHTML = ''; // Clear existing options

    expansions.forEach(expansion => {
        const option = document.createElement('option');
        option.text = expansion.displayName;
        option.value = expansion.value;

        // Set "The War Within" as the default selected option
        if (expansion.value === 2569) {
            option.selected = true;
        }
        selectElement.add(option);
    });

    // Trigger fetch on expansion select change
    $('#expansionSelect').on('change', function () {
        const selectedValue = $(this).val();
    
        // Hide current main content and show loader
        $('#reps').hide().empty();
        $('.main-content').hide();
        $('.loader-content').show();
        $('#loader').fadeIn(); // Show loader again

        // Reset timer when changing expansions
        stopTimer();
        startTimer();

        ajaxTime = Date.now();
        fetchReps(selectedValue);
    });

    // Fetch data for the default selected expansion
    fetchReps(2569);
});

function getStandingCategory(standingName) {
    const lower = standingName.toLowerCase();
  
    // Esteemed category
    const esteemed = ["exalted", "maximum", "cordial", "appreciative", "renown", "renown_25"];
    if (esteemed.some(s => lower.includes(s))) {
      return "esteemed";
    }
  
    // Negative category
    const negative = ["hated", "hostile", "unfriendly", "dubious", "apprehensive"];
    if (negative.some(s => lower.includes(s))) {
      return "negative";
    }
  
    // Neutral category
    const neutral = ["neutral", "low", "stranger", "preferred", "acquaintance", "empty", "cohort", "tentative", "ambivalent", "ally"];
    if (neutral.some(s => lower.includes(s))) {
      return "neutral";
    }
  
    // Positive category
    const positive = ["friendly", "valued", "fang", "respected", "medium", "high", "honored", "revered", "friend"];
    if (positive.some(s => lower.includes(s))) {
      return "positive";
    }
  
    // Default if none matched
    return "neutral";
}  

function getProgress(rep) {
    // If the faction is renown-based and we know the max renown level:
    if (rep.is_renown && rep.max_renown_level) {
      const currentLevel = rep.renown_level;
      const maxLevel = rep.max_renown_level;
  
      // If they're at the max renown level, show full progress.
      if (currentLevel >= maxLevel) {
        return 100;
      }
  
      // Otherwise, calculate based on how far into the renown levels they are.
      const baseProgress = (currentLevel / maxLevel) * 100;
  
      // If you have partial progress in rep.value/rep.max for the current level:
      if (rep.max > 0 && rep.value > 0) {
        const segmentSize = 100 / maxLevel;
        const partialProgress = (rep.value / rep.max) * segmentSize;
        return Math.min(100, baseProgress + partialProgress);
      }
  
      return baseProgress;
    }
  
    // For non-renown factions, fall back to old logic:
    if (rep.max > 0) {
      return (rep.value / rep.max) * 100;
    }
  
    // If no max and not renown-based, treat as completed:
    return 100;
}

function isFinalRenownLevel(rep) {
    const finalRenownLevels = {
      2507: 30, // Dragonscale Expedition max
      2510: 30, // Valdrakken Accord max
      2511: 30, // Iskaara Tuskarr max
      2590: 25, // Council of Dornogal max renown
    };
  
    return finalRenownLevels[rep.faction_id] && rep.renown_level >= finalRenownLevels[rep.faction_id];
}

function formatLastLogin(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();

    const diffInMs = now - date;
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) {
        return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffInDays === 1) {
        return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffInDays < 7) {
        return `${diffInDays} days ago at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
        return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
    }
}

function createCard(alt) {
    let altClass = alt.class.toLowerCase().replace(' ', '');
    let altFaction = alt.faction.toLowerCase();
    let altLevel = '';

    if (alt.level < 80) {
        altLevel = `<p class="icon card-text level-icon ${altClass} ${altClass}-border">${alt.level}</p>`;
    }

    let card = `
    <article class="alt card ${altClass} ${altFaction}" style="background-image: url('${alt.main_image}')">
        <div class="card-body">
            <h1 class="card-title ${altClass}">${alt.name}</h1>
            <dl>
                <dt>Realm</dt>
                <dd>${alt.realm}</dd>
            </dl>
    `;

    // Render reputations
    $.each(alt.reps, function (i, rep) {
        let progress = getProgress(rep);
        let categoryClass = getStandingCategory(rep.standing_name);
        card += `
          <dl class="reputations ${categoryClass}" data-filter="${rep.faction_name.toLowerCase()}">
            <dt>${rep.faction_name}</dt>
            <dd class="flex ${categoryClass}">
              <div class="progress-bar">
                <span class="progress" style="width: ${progress}%"></span>
              </div>
              ${rep.standing_name}
            </dd>
          </dl>
        `;
    });

    card += `
            <div class="card-footer">
                <p class="alt-id">${alt.character_id}</p>
                <p class="last-login">${formatLastLogin(alt.last_login)}</p>
            </div>
            <div class="alt-icons">
                <img class="icon faction-icon ${altFaction}-icon" data-filter="${altFaction}" src="/static/images/${altFaction}.png" alt="${alt.faction} icon">
                <img class="icon class-icon" data-filter="${altClass}" src="/static/flatborder/${altClass}_flatborder.png" alt="${altClass} icon">
                ${altLevel}
            </div>
        </div>
    </article>
    `;
    return card;
}